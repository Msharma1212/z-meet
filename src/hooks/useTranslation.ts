import { useAuth } from '../context/AuthContext';
import { translations } from '../lib/translations';

export const useTranslation = () => {
  const { user } = useAuth();
  const language = user?.settings?.language || 'English (US)';
  const t = translations[language] || translations['English (US)'];

  const localeMap: Record<string, string> = {
    'English (US)': 'en-US',
    'Hindi (India)': 'hi-IN',
    'Spanish (ES)': 'es-ES',
    'French (FR)': 'fr-FR'
  };

  const localeCode = localeMap[language] || 'en-US';

  return { t, language, localeCode };
};
