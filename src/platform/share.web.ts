/**
 * React Native Web does not implement Share, so the web target copies instead. The diagnostics
 * screen also renders the summary as selectable text, so this failing costs nothing.
 */
interface ClipboardHost {
  navigator?: { clipboard?: { writeText(text: string): Promise<void> } };
}

export async function shareText(text: string, title: string): Promise<void> {
  void title;
  const clipboard = (globalThis as ClipboardHost).navigator?.clipboard;
  if (clipboard === undefined) {
    return;
  }
  try {
    await clipboard.writeText(text);
  } catch {
    // Permission denied or an insecure origin. The selectable text is the fallback.
  }
}
