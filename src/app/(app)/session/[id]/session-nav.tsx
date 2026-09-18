import Link from "next/link";
import { buttonClasses } from "@/components/ui/button-styles";
import { sessionPath, sessionRecapPath } from "@/lib/session-paths";

const footerClass =
  "sticky bottom-0 -mx-4 mt-auto flex flex-col gap-2 border-t border-border bg-background/90 px-4 py-3 backdrop-blur [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]";

export function RecapNav({ sessionId }: { sessionId: string }) {
  return (
    <div className={footerClass}>
      <Link href="/" className={buttonClasses("primary", "lg", "w-full animate-rise")}>
        Home
      </Link>
      <Link href={sessionPath(sessionId)} className={buttonClasses("secondary", "lg", "w-full")}>
        View workout
      </Link>
    </div>
  );
}

export function FinishedWorkoutNav({ sessionId }: { sessionId: string }) {
  return (
    <div className={footerClass}>
      <Link href="/" className={buttonClasses("primary", "lg", "w-full")}>
        Home
      </Link>
      <Link href={sessionRecapPath(sessionId)} className={buttonClasses("secondary", "lg", "w-full")}>
        View recap
      </Link>
    </div>
  );
}
