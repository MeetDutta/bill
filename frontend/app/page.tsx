import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground">
          Digitalbill-dpramp
        </h1>
        <p className="mb-8 text-lg text-muted-foreground">
          Transform every transaction into a long-term customer relationship.
          Digital bills, CRM, loyalty, WhatsApp engagement, and analytics.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/login">
            <Button size="lg">Login</Button>
          </Link>
          <Link href="/register">
            <Button variant="outline" size="lg">Get Started</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
