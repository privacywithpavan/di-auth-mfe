import {
  ArrowRight,
  Check,
  Ellipsis,
  Maximize2,
  Mic,
  Minimize2,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const signInLabel = "Sign in or create an account";
const bubble =
  "ml-auto block w-fit max-w-4/5 rounded-[18px_3px_18px_18px] bg-chat-bubble px-5 py-3 text-[17px] leading-snug text-white";
const headerButton = "text-white hover:bg-white/15 hover:text-white";
const promptButton =
  "h-auto min-h-10 justify-start whitespace-normal border-2 border-transparent px-4 py-2 text-left text-content [background:var(--background-chat-prompt)] hover:underline";

type Session = { user: { name: string }; csrfToken: string };
type Launch = { state: string; url: string };
type Exchange = { question: string; answer: string };

export function ChatHost({
  mfeOrigin,
  clientId,
}: {
  mfeOrigin: string;
  clientId: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [launch, setLaunch] = useState<Launch>();
  const [frameHeight, setFrameHeight] = useState(370);
  const [session, setSession] = useState<Session>();
  const [busy, setBusy] = useState(true);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState<string>();
  const [expanded, setExpanded] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Exchange[]>([]);

  const checkSession = useCallback(
    async (openIfSignedOut = false) => {
      setBusy(true);
      setError(undefined);
      try {
        const response = await fetch("/session", { cache: "no-store" });
        if (response.ok) {
          setSession((await response.json()) as Session);
          setLaunch(undefined);
          setCancelled(false);
          return;
        }
        if (response.status !== 401) throw new Error("Session check failed");
        setSession(undefined);
        if (openIfSignedOut) {
          const state = crypto.randomUUID();
          const url = new URL("/", mfeOrigin);
          url.search = new URLSearchParams({ clientId, state }).toString();
          setFrameHeight(370);
          setCancelled(false);
          setLaunch({ state, url: url.href });
        } else {
          setLaunch(undefined);
        }
      } catch {
        setError(
          "We couldn’t check your session. Please try signing in again.",
        );
        setLaunch(undefined);
      } finally {
        setBusy(false);
      }
    },
    [clientId, mfeOrigin],
  );

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (!launch) return;
    const timer = window.setTimeout(() => {
      setLaunch(undefined);
      setError("Sign-in could not be opened. Please try again.");
    }, 35_000);

    const receive = (event: MessageEvent) => {
      const message = event.data;
      if (
        event.origin !== mfeOrigin ||
        event.source !== frame.current?.contentWindow ||
        message?.version !== 1 ||
        message.state !== launch.state
      )
        return;

      if (message.type === "IAM_AUTH_READY") {
        window.clearTimeout(timer);
        frame.current?.contentWindow?.postMessage(
          {
            type: "IAM_AUTH_CONFIRM",
            version: 1,
            state: launch.state,
          },
          mfeOrigin,
        );
      } else if (
        message.type === "IAM_AUTH_RESIZE" &&
        Number.isFinite(message.height)
      ) {
        setFrameHeight(Math.min(1400, Math.max(250, message.height)));
      } else if (message.type === "IAM_AUTH_CANCELLED") {
        setLaunch(undefined);
        setCancelled(true);
      } else if (message.type === "IAM_AUTH_COMPLETE") {
        void checkSession();
      }
    };
    window.addEventListener("message", receive);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("message", receive);
    };
  }, [launch, mfeOrigin, checkSession]);

  function signIn() {
    if (!busy && !launch) void checkSession(true);
  }

  async function logout() {
    if (!session || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/session/logout", {
        method: "POST",
        headers: { "X-CSRF-Token": session.csrfToken },
      });
      if (!response.ok) throw new Error("Logout failed");
      setSession(undefined);
      setMessages([]);
      setQuestion("");
    } catch {
      setError("We couldn’t sign you out. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function ask(text: string) {
    if (!session) {
      signIn();
      return;
    }
    setMessages((previous) => [
      ...previous,
      {
        question: text,
        answer: `Secure answer for ${session.user.name}. Your IAM session was independently verified.`,
      },
    ]);
  }

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (question.trim()) {
      ask(question.trim());
      setQuestion("");
    }
  }

  const hasResponse = Boolean(launch || session || cancelled);

  return (
    <main className="grid min-h-dvh place-items-start justify-items-center bg-chat-canvas text-content">
      <section
        className={cn(
          "flex min-h-dvh w-full flex-col border-x-2 border-chat-edge bg-chat-surface min-[700px]:shadow-chat-panel",
          expanded ? "max-w-4xl" : "max-w-[592px]",
        )}
        aria-label="Virtual Assistant"
      >
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-2 bg-chat-header px-4 text-white min-[521px]:px-[22px]">
          <h1 className="flex items-center gap-2.5 text-[17px] font-emphasis min-[521px]:text-xl">
            <Sparkles className="size-7 shrink-0" aria-hidden="true" />
            Virtual Assistant
          </h1>
          <div className="flex items-center gap-2 min-[521px]:gap-4">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={headerButton}
              aria-label={
                expanded ? "Restore assistant size" : "Expand assistant"
              }
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <Minimize2 className="size-6" />
              ) : (
                <Maximize2 className="size-6" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={headerButton}
              aria-label={session ? "Log out" : "Continue"}
              disabled={busy || Boolean(launch)}
              onClick={session ? () => void logout() : signIn}
            >
              <ArrowRight className="size-7" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={headerButton}
              aria-label="More options"
              aria-disabled="true"
            >
              <Ellipsis className="size-6" />
            </Button>
          </div>
        </header>
        <section
          aria-label="Conversation"
          className="flex-1 px-4 py-7 min-[521px]:px-[22px]"
        >
          <output className="sr-only">
            {session
              ? `Signed in as ${session.user.name}`
              : cancelled
                ? "Sign in cancelled"
                : busy
                  ? "Checking session"
                  : "Signed out"}
          </output>
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-notice bg-notice p-3 text-help text-notice-foreground"
            >
              {error}
            </p>
          )}
          {hasResponse ? (
            <p className={bubble}>{signInLabel}</p>
          ) : (
            <Button
              type="button"
              onClick={signIn}
              disabled={busy}
              className={cn(
                bubble,
                "h-auto whitespace-normal hover:bg-chat-bubble-hover",
              )}
            >
              {signInLabel}
            </Button>
          )}
          {hasResponse && (
            <div className="mt-3 flex min-h-15 items-center justify-between">
              <Sparkles className="size-7 text-chat-spark" aria-hidden="true" />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-chat-icon"
                aria-label="Read response aloud"
                aria-disabled="true"
              >
                <Volume2 className="size-6" />
              </Button>
            </div>
          )}
          {launch && (
            <Card
              className="animate-auth-enter border-2 border-chat-border py-0 ring-0"
              aria-label="Secure sign in"
            >
              <iframe
                ref={frame}
                title="Authentication"
                src={launch.url}
                allow="publickey-credentials-get; publickey-credentials-create"
                className="block w-full bg-background"
                style={{ height: frameHeight }}
              />
            </Card>
          )}
          {(session || cancelled) && (
            <>
              <Card className="grid grid-cols-[30px_1fr] items-start gap-4 border-2 border-chat-border px-5 py-6 ring-0">
                <span
                  className={cn(
                    "grid size-[30px] place-items-center rounded-full text-white",
                    session
                      ? "bg-chat-confirmed shadow-chat-confirmed"
                      : "bg-chat-cancelled shadow-chat-cancelled",
                  )}
                  aria-hidden="true"
                >
                  {session ? (
                    <Check className="size-5" />
                  ) : (
                    <X className="size-5" />
                  )}
                </span>
                <div className="space-y-1">
                  <h2 className="text-step-title font-medium">
                    {session
                      ? `Hi ${session.user.name.split(" ")[0]}`
                      : "Sign in or new account canceled"}
                  </h2>
                  <p className="text-help text-muted-foreground">
                    {session
                      ? "You’re signed in to your account."
                      : "You’ve canceled signing in or creating your account."}
                  </p>
                  {cancelled && (
                    <Button
                      type="button"
                      variant="link"
                      onClick={signIn}
                      disabled={busy}
                      className="h-auto p-0 text-help text-link"
                    >
                      {signInLabel}
                    </Button>
                  )}
                </div>
              </Card>
              <div className="mt-[18px] flex flex-col items-start gap-2">
                {(session
                  ? ["Join Dell Rewards", "View Dell AI laptops"]
                  : [
                      "First prompt for a signed in user",
                      "Second prompt for a signed in user",
                    ]
                ).map((prompt) => (
                  <Button
                    key={prompt}
                    type="button"
                    variant="outline"
                    className={promptButton}
                    onClick={() => ask(prompt)}
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            </>
          )}
          {messages.length > 0 && (
            <ol className="mt-5 grid gap-2.5">
              {messages.map(({ question, answer }, index) => (
                <li key={`${index}-${question}`} className="grid gap-2.5">
                  <p className={cn(bubble, "text-help")}>{question}</p>
                  <p className="w-fit max-w-4/5 rounded-xl border border-chat-border-muted bg-card px-4 py-3 text-help">
                    {answer}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
        <footer className="px-[18px] pb-3">
          <form
            onSubmit={send}
            className="flex items-center gap-1 rounded-full border border-chat-border-muted bg-background py-1.5 pr-1.5 pl-4 shadow-chat-composer"
          >
            <Input
              aria-label="Ask the assistant"
              placeholder="Ask me a question..."
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              className="h-11 border-transparent text-content placeholder:font-semibold placeholder:text-chat-icon"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-chat-icon"
              aria-label="Use microphone"
              aria-disabled="true"
            >
              <Mic className="size-5" />
            </Button>
            <Button
              type="submit"
              size="icon"
              aria-label="Send message"
              className="size-11 rounded-full bg-chat-send text-white"
            >
              <ArrowRight className="size-6" />
            </Button>
          </form>
          <p className="mt-3 text-center text-caption text-muted-foreground">
            Please verify responses.{" "}
            <a href="#transparency" className="text-link hover:underline">
              Transparency statement
            </a>
          </p>
          <p
            id="transparency"
            className="hidden text-center text-caption text-muted-foreground target:block"
          >
            Assistant responses in this test are examples.
          </p>
        </footer>
      </section>
    </main>
  );
}
