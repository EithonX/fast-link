declare module 'lucide-react' {
  import type { ComponentPropsWithoutRef, ForwardRefExoticComponent, RefAttributes } from 'react';

  export interface LucideProps extends ComponentPropsWithoutRef<'svg'> {
    absoluteStrokeWidth?: boolean;
    size?: number | string;
  }

  export type LucideIcon = ForwardRefExoticComponent<
    LucideProps & RefAttributes<SVGSVGElement>
  >;

  export const AlertCircle: LucideIcon;
  export const ArrowRight: LucideIcon;
  export const Check: LucideIcon;
  export const CheckIcon: LucideIcon;
  export const ChevronDown: LucideIcon;
  export const ChevronDownIcon: LucideIcon;
  export const ChevronRightIcon: LucideIcon;
  export const ChevronUpIcon: LucideIcon;
  export const CircleCheckIcon: LucideIcon;
  export const CircleIcon: LucideIcon;
  export const Clipboard: LucideIcon;
  export const Clock: LucideIcon;
  export const Copy: LucideIcon;
  export const Download: LucideIcon;
  export const ExternalLink: LucideIcon;
  export const File: LucideIcon;
  export const FileText: LucideIcon;
  export const Globe: LucideIcon;
  export const HardDrive: LucideIcon;
  export const History: LucideIcon;
  export const Info: LucideIcon;
  export const InfoIcon: LucideIcon;
  export const Link2: LucideIcon;
  export const Loader2: LucideIcon;
  export const Loader2Icon: LucideIcon;
  export const Maximize2: LucideIcon;
  export const Minimize2: LucideIcon;
  export const MoreVertical: LucideIcon;
  export const OctagonXIcon: LucideIcon;
  export const Play: LucideIcon;
  export const Quote: LucideIcon;
  export const RotateCcw: LucideIcon;
  export const Share: LucideIcon;
  export const Shield: LucideIcon;
  export const Trash2: LucideIcon;
  export const TriangleAlertIcon: LucideIcon;
  export const X: LucideIcon;
  export const XIcon: LucideIcon;
  export const Zap: LucideIcon;
}
