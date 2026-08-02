import { Spinner } from '@/components/ui/spinner.tsx'

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <Spinner className="size-8" />
    </div>
  )
}

export { RouteFallback }
