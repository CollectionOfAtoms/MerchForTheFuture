"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { contactSupportAction } from "@/app/actions/order";

export default function ContactSupportModal({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  // Auto-close after success
  useEffect(() => {
    if (status === "success") {
      timerRef.current = setTimeout(() => {
        setOpen(false);
        setStatus("idle");
        setMessage("");
      }, 2000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [status]);

  function handleClose() {
    if (isPending) return;
    setOpen(false);
    setStatus("idle");
    setErrorMsg(null);
  }

  function handleSubmit() {
    setErrorMsg(null);
    startTransition(async () => {
      const result = await contactSupportAction(orderId, message);
      if ("error" in result) {
        setStatus("error");
        setErrorMsg(result.error);
      } else {
        setStatus("success");
      }
    });
  }

  const canSend = message.trim().length > 0 && !isPending;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-stone-500 hover:text-stone-800 transition-colors"
      >
        Contact support
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
          onKeyDown={(e) => { if (e.key === "Escape") handleClose(); }}
          role="dialog"
          aria-modal="true"
          aria-label="Contact support"
          tabIndex={-1}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-stone-900">Contact support</h2>
              <button
                onClick={handleClose}
                className="text-stone-400 hover:text-stone-700 transition-colors text-lg leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {status === "success" ? (
              <p className="text-sm text-emerald-700 font-medium text-center py-6">
                Your message has been sent.
              </p>
            ) : (
              <>
                <label className="block text-sm font-medium text-stone-700 mb-2" htmlFor="support-message">
                  Describe your issue
                </label>
                <textarea
                  id="support-message"
                  ref={textareaRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none resize-none"
                  placeholder="Describe what you need help with…"
                />

                {errorMsg && (
                  <p className="mt-2 text-xs text-red-600">{errorMsg}</p>
                )}

                <div className="mt-4 flex justify-end gap-3">
                  <button
                    onClick={handleClose}
                    className="rounded-full border border-stone-200 px-5 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!canSend}
                    className="rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50 transition-colors"
                  >
                    {isPending ? "Sending…" : "Send"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
