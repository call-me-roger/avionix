import { Share } from 'react-native';

/** Hands the text to the OS share sheet. Errors are swallowed: sharing is never load-bearing. */
export async function shareText(text: string, title: string): Promise<void> {
  try {
    await Share.share({ message: text, title });
  } catch {
    // The user dismissed the sheet, or the platform refused. Nothing to recover.
  }
}
