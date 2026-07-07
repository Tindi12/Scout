import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'font-label inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'border border-primary/70 bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'border border-destructive/70 bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-white/15 bg-transparent text-foreground hover:border-white/25 hover:bg-white/[0.05]',
        secondary:
          'border border-white/10 bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost:
          'text-muted-foreground hover:bg-white/[0.05] hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:text-primary/80 hover:underline',
        chip: 'border border-white/15 bg-transparent text-muted-foreground hover:border-white/25 hover:bg-white/[0.05] hover:text-foreground data-[state=selected]:border-primary/70 data-[state=selected]:bg-primary data-[state=selected]:text-primary-foreground data-[state=selected]:hover:bg-primary/90',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, disabled, children, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {/* Slot requires exactly one child, so only real buttons get a spinner. */}
        {asChild ? (
          children
        ) : (
          <>
            {loading ? (
              <Loader2
                className="animate-spin"
                strokeWidth={2}
                aria-hidden="true"
              />
            ) : null}
            {children}
          </>
        )}
      </Comp>
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
