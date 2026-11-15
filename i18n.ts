import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { deBundle, enBundle } from './locales/translations';

const savedLanguage = (typeof window !== 'undefined' && localStorage.getItem('app_language')) || 'en';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      de: { translation: deBundle },
      en: { translation: enBundle }
    },
    lng: savedLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
