import { FlashIcon } from "@hugeicons/core-free-icons"
import { Link } from "@tanstack/react-router"

import { Icon } from "~/components/ui/icon"
import { ModeToggle } from "~/features/settings/mode-toggle"
import { cn } from "~/lib/utils"

interface HeaderProps {
  className?: string
  sticky?: boolean
}

export function Header({ className, sticky = true }: HeaderProps) {
  return (
    <header
      className={cn(
        "bg-background/95 supports-backdrop-filter:bg-background/80 z-50 border-b backdrop-blur-md",
        sticky && "sticky top-0",
        className
      )}
    >
      <div className="flex h-14 w-full items-center gap-3 px-4 md:h-16 md:px-8 lg:px-10 xl:px-14">
        <Link
          to="/"
          viewTransition
          className="flex min-w-0 items-center gap-2.5 no-underline"
        >
          <span className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-xl">
            <Icon icon={FlashIcon} size={20} />
          </span>
          <span className="truncate text-lg font-semibold tracking-tight">
            FastLink
          </span>
        </Link>

        <nav aria-label="Main navigation" className="ml-auto flex min-w-0 items-center gap-2 sm:gap-5">
          <Link to="/fastlink" viewTransition
            activeProps={{ className: "font-semibold text-foreground" }}
            className="text-muted-foreground hover:text-foreground px-1 text-xs font-medium transition-colors sm:text-sm">
            Fast Links
          </Link>
          <Link to="/app" viewTransition
            activeProps={{ className: "font-semibold text-foreground" }}
            className="text-muted-foreground hover:text-foreground px-1 text-xs font-medium transition-colors sm:text-sm">
            Analyze
          </Link>
          <ModeToggle />
        </nav>
      </div>
    </header>
  )
}
