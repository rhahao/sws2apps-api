export interface Language {
  locale: string;
  threeLettersCode: string;
  code: string;
}

export const ALL_LANGUAGES: Language[] = [
  { locale: 'de-DE', threeLettersCode: 'deu', code: 'X' },
  { locale: 'en', threeLettersCode: 'eng', code: 'E' },
  { locale: 'mg-MG', threeLettersCode: 'mlg', code: 'MG' },
  { locale: 'pl-PL', threeLettersCode: 'pol', code: 'P' },
  { locale: 'pt-POR', threeLettersCode: 'por', code: 'T' },
  { locale: 'ru-RU', threeLettersCode: 'rus', code: 'U' },
  { locale: 'mg-TTM', threeLettersCode: 'ttm', code: 'TTM' },
  { locale: 'uk-UA', threeLettersCode: 'ukr', code: 'K' },
];
