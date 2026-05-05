import { Facebook, Instagram, Youtube } from 'lucide-react';

export const SOCIAL_LINKS = [
  {
    label: 'Facebook',
    href: 'https://www.facebook.com/profile.php?id=100074024491964',
    bg: 'bg-[#1877F2]',
    shadow: 'shadow-blue-500/20',
    icon: <Facebook className="w-5 h-5" />,
  },
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/iglesiacartagommm/',
    bg: 'bg-gradient-to-br from-[#833ab4] via-[#fd1d1d] to-[#fcb045]',
    shadow: 'shadow-pink-500/20',
    icon: <Instagram className="w-5 h-5" />,
  },
  {
    label: 'YouTube',
    href: 'https://www.youtube.com/@emisoralavozdelaverdad9188',
    bg: 'bg-[#cf0a0a]',
    shadow: 'shadow-red-500/20',
    icon: <Youtube className="w-5 h-5" />,
  },
  {
    label: 'Spotify',
    href: 'https://open.spotify.com/show/7hSkCQDHvdjr4aYE5X6Gv4?si=a4cfd87d109543a2',
    bg: 'bg-[#1DB954]',
    shadow: 'shadow-green-500/20',
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.517 17.32a.748.748 0 0 1-1.03.25c-2.82-1.724-6.373-2.114-10.56-1.158a.748.748 0 1 1-.334-1.458c4.579-1.047 8.504-.596 11.674 1.337a.748.748 0 0 1 .25 1.03zm1.473-3.275a.936.936 0 0 1-1.287.308c-3.226-1.983-8.143-2.557-11.963-1.4a.937.937 0 0 1-.543-1.79c4.358-1.322 9.776-.682 13.485 1.595a.936.936 0 0 1 .308 1.287zm.127-3.408C15.32 8.39 9.325 8.19 5.7 9.296a1.123 1.123 0 1 1-.652-2.148c4.175-1.267 11.115-1.023 15.497 1.617a1.123 1.123 0 1 1-1.428 1.872z"/>
      </svg>
    ),
  },
  {
    label: 'Google Play',
    href: 'https://play.google.com/store/apps/details?id=com.lavozverdad.radio',
    bg: 'bg-black',
    shadow: 'shadow-black/40',
    icon: <GooglePlayIcon size={32} />, // ajusta tu icono para recibir size
    featured: true,
  }
] as const;

function GooglePlayIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M48 28.3L275.6 256 48 483.7C40.9 479.3 36 471.7 36 463V49C36 40.3 40.9 32.7 48 28.3Z" fill="#EA4335"/>
      <path d="M352.3 182.7L296.8 238.2 48 28.3C54.3 24.7 62.1 24.5 68.7 28.1L352.3 182.7Z" fill="#FBBC04"/>
      <path d="M352.3 329.3L68.7 483.9C62.1 487.5 54.3 487.3 48 483.7L296.8 273.8L352.3 329.3Z" fill="#34A853"/>
      <path d="M476 256C476 264.8 471 272.4 463.7 276.7L352.3 329.3L296.8 256L352.3 182.7L463.7 235.3C471 239.6 476 247.2 476 256Z" fill="#4285F4"/>
    </svg>
  );
}

export function getSocialLinksWithLiveStatus(liveUrl: string | null) {
  return SOCIAL_LINKS.map((link) =>
    link.label === 'Facebook' && liveUrl
      ? { ...link, href: liveUrl, isLive: true }
      : { ...link, isLive: false }
  );
}
