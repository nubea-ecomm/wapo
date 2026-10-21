import { useId, type ReactNode } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from './ui/card'
import { WapoLogo } from './wapo-logo'
import { AuthPreferences } from './auth-preferences'

export function AuthLayout({
  title,
  description,
  children,
  footer,
  secondary,
}: {
  title: string
  description: ReactNode
  children: ReactNode
  footer?: ReactNode
  secondary?: ReactNode
}) {
  const titleID = useId()

  return (
    <main className="login">
      <AuthPreferences />
      <div className="login-content">
        <a
          className="login-brand"
          href="#/"
          aria-label="Wapo"
        >
          <WapoLogo />
        </a>
        <Card
          className="login-panel"
          role="region"
          aria-labelledby={titleID}
        >
          <CardHeader>
            <h1 id={titleID}>{title}</h1>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="login-card-content">{children}</CardContent>
          {footer && <CardFooter className="login-footer">{footer}</CardFooter>}
        </Card>
        {secondary && <div className="login-secondary">{secondary}</div>}
      </div>
    </main>
  )
}
