export async function copyTextToClipboard(text: string): Promise<boolean> {
  // execCommand must run in the originating tap. Awaiting writeText first can
  // drop the user gesture on iOS Safari / in-app browsers, and writeText can
  // also resolve without actually writing. Prefer the selectable fallback.
  if (copyWithExecCommand(text)) return true;
  if (!navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function copyWithExecCommand(text: string): boolean {
  if (typeof document === "undefined" || !document.body) return false;

  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.setAttribute("aria-hidden", "true");
  input.style.position = "fixed";
  input.style.top = "0";
  input.style.left = "0";
  input.style.width = "1px";
  input.style.height = "1px";
  input.style.padding = "0";
  input.style.border = "0";
  input.style.opacity = "0";
  const active = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  const { scrollX, scrollY } = window;
  document.body.append(input);

  input.focus();
  input.select();
  input.setSelectionRange(0, input.value.length);

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }

  input.remove();
  active?.focus();
  window.scrollTo(scrollX, scrollY);
  return ok;
}
