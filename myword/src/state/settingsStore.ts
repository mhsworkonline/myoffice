// AutoCorrect / AutoFormat options (File > Options > Proofing > AutoCorrect Options).

export interface AutocorrectSettings {
  smartQuotes: boolean;
  replaceText: boolean;
  capitalizeSentences: boolean;
  autoLists: boolean;
  dashes: boolean;
  ordinals: boolean;
}

let ac: AutocorrectSettings = {
  smartQuotes: true,
  replaceText: true,
  capitalizeSentences: true,
  autoLists: true,
  dashes: true,
  ordinals: true,
};

export function autocorrectSettings(): AutocorrectSettings {
  return ac;
}

export function setAutocorrectSettings(patch: Partial<AutocorrectSettings>): void {
  ac = { ...ac, ...patch };
}
