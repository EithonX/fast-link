/**
 * FastLink Route Handler
 * Handles /info, /p/, /telegram routes for download proxy functionality
 * Note: /view/ routes are now handled by React Router
 */

import { formatFileSize, getFileInfo } from './file-info';
import { getEmulationHeaders } from './server-utils';

interface FastLinkEnv {
  BOT_TOKEN?: string;
  WORKER_BASE_URL?: string;
}

/**
 * Main route dispatcher for FastLink routes
 * Returns Response if route matches, null otherwise
 */
export async function handleFastLinkRoutes(
  request: Request,
  env: FastLinkEnv,
  url: URL,
): Promise<Response | null> {
  const { pathname } = url;

  // Info API endpoint
  if (pathname === '/info') {
    return handleInfoRoute(url);
  }

  // Proxy/download handler
  if (pathname.startsWith('/p/')) {
    return handleProxyRoute(request, url);
  }

  // Telegram webhook
  if (pathname === '/telegram' && request.method === 'POST') {
    return handleTelegramRoute(request, env);
  }

  return null;
}

/**
 * Handle /info?url= API endpoint
 */
async function handleInfoRoute(url: URL): Promise<Response> {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  const targetUrl = url.searchParams.get('url');
  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing URL parameter' }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  try {
    new URL(targetUrl);
    const fileInfo = await getFileInfo(targetUrl);
    return new Response(JSON.stringify(fileInfo), {
      headers: {
        ...corsHeaders,
        'Cache-Control': 'public, max-age=600',
      },
    });
  } catch (err) {
    console.error('/info error:', err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Failed to fetch file info',
      }),
      { status: 500, headers: corsHeaders },
    );
  }
}

/**
 * Handle /p/:encoded/:filename proxy/download route
 */
async function handleProxyRoute(
  request: Request,
  url: URL,
): Promise<Response> {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Expose-Headers':
      'Content-Range, Content-Length, Content-Type, Content-Disposition',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) {
    return new Response(
      'Invalid fast link format. Expected /p/<encoded_url>/[filename]',
      { status: 400, headers: corsHeaders },
    );
  }

  try {
    let targetLink: string;
    try {
      targetLink = atob(decodeURIComponent(parts[1]));
      new URL(targetLink);
    } catch {
      return new Response('Invalid encoded URL in fast link.', {
        status: 400,
        headers: corsHeaders,
      });
    }

    const filename = parts[2] ? decodeURIComponent(parts[2]) : null;

    // Build upstream request headers
    const upstreamHeaders = getEmulationHeaders();

    // Forward Range header if present
    const range = request.headers.get('range');
    if (range) {
      upstreamHeaders.set('Range', range);
    }

    const response = await fetch(targetLink, {
      method: request.method,
      headers: upstreamHeaders,
      redirect: 'follow',
    });

    const responseHeaders = new Headers(response.headers);

    // Set appropriate Content-Disposition based on streaming vs download
    // For streaming (when accessed directly by players), prefer inline to avoid download prompts
    if (filename) {
      // Check if this is a streaming request (Range header present) - use inline for better player compatibility
      const isStreamingRequest = !!range;
      const disposition = isStreamingRequest ? 'inline' : 'attachment';
      responseHeaders.set(
        'Content-Disposition',
        `${disposition}; filename="${filename.replace(/"/g, '\\"')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
    }

    // Ensure Accept-Ranges is set for media player seeking support
    if (!responseHeaders.has('Accept-Ranges')) {
      responseHeaders.set('Accept-Ranges', 'bytes');
    }

    // Add CORS headers
    Object.entries(corsHeaders).forEach(([key, value]) => {
      responseHeaders.set(key, value);
    });
    responseHeaders.set('X-Proxy-Service', 'Cloudflare-Worker-FastLink');
    
    // Add Cache-Control for efficient streaming (allows caching of video segments)
    if (!responseHeaders.has('Cache-Control')) {
      responseHeaders.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    }

    // Handle range responses
    let status = response.status;
    if (
      range &&
      response.status === 200 &&
      response.headers.has('content-range')
    ) {
      status = 206;
    }

    const body = request.method === 'HEAD' ? null : response.body;
    return new Response(body, { status, headers: responseHeaders });
  } catch (err) {
    console.error('Proxy/Download error:', err);
    return new Response('Failed to fetch the target link through proxy.', {
      status: 502,
      headers: corsHeaders,
    });
  }
}

/**
 * Handle /telegram webhook for Telegram bot integration
 */
async function handleTelegramRoute(
  request: Request,
  env: FastLinkEnv,
): Promise<Response> {
  if (!env.BOT_TOKEN) {
    return new Response('Telegram bot not configured', { status: 503 });
  }

  try {
    const update = (await request.json()) as {
      message?: {
        text?: string;
        chat: { id: number };
      };
    };

    if (!update.message?.text) {
      return new Response('No valid message found in Telegram update', {
        status: 400,
      });
    }

    const inputUrl = update.message.text.trim();
    const chatId = update.message.chat.id;

    const sendMessage = async (text: string) => {
      const telegramUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
      await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
        }),
      });
    };

    // Validate URL
    try {
      new URL(inputUrl);
    } catch {
      await sendMessage('⚠️ Please send a valid URL starting with http:// or https://');
      return new Response('OK', { status: 200 });
    }

    // Fetch file info
    let fileInfo;
    try {
      fileInfo = await getFileInfo(inputUrl);
    } catch (error) {
      console.error('Telegram - getFileInfo error:', error);
      await sendMessage(
        '⚠️ Error: Could not fetch file information. Please ensure the URL is correct and publicly accessible.',
      );
      return new Response('OK', { status: 200 });
    }

    // Generate fast link
    const baseUrl = env.WORKER_BASE_URL || '';
    let fastLink =
      baseUrl + '/p/' + encodeURIComponent(btoa(inputUrl));
    if (fileInfo.filename) {
      fastLink += '/' + encodeURIComponent(fileInfo.filename);
    }

    const formattedSize = formatFileSize(fileInfo.size);
    const replyText = `📄 *File Name:* \`${fileInfo.filename || 'Unknown'}\`
📦 *File Size:* ${formattedSize}

🔗 *Fast Link:*
\`\`\`
${fastLink}
\`\`\``;

    await sendMessage(replyText);
    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('Telegram webhook processing error:', err);
    return new Response('Error processing Telegram update', { status: 500 });
  }
}
