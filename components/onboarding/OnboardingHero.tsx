import React, { useEffect, useState } from "react";
import { Lottie } from "lottie-react";
import { Sparkles } from "lucide-react";

interface OnboardingHeroProps {
  welcomeTitle: string;
  welcomeDescription: string;
  primaryColor?: string;
  showAnimation?: boolean;
  logoUrl?: string | null;
  clubName?: string;
}

export const OnboardingHero: React.FC<OnboardingHeroProps> = ({
  welcomeTitle,
  welcomeDescription,
  primaryColor = "#1b4332",
  showAnimation = true,
  logoUrl,
  clubName,
}) => {
  const [animationData, setAnimationData] = useState<object | null>(null);
  const [lottieFailed, setLottieFailed] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    fetch("/images/onboarding_animation.json")
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch animation: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setAnimationData(data);
        }
      })
      .catch((err) => {
        console.warn("Could not load /images/onboarding_animation.json:", err);
        if (isMounted) {
          setLottieFailed(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const LottieComponent = Lottie as any;

  return (
    <div
      id="onboarding-hero-column"
      className="flex flex-col justify-center text-center md:text-left space-y-3 md:space-y-3.5 pr-0 md:pr-2"
    >
      {/* Club Logo / Animation (Visual Hero) */}
      {showAnimation && (
        <div
          id="onboarding-hero-animation-container"
          className="flex items-center justify-center w-full max-h-[110px] md:max-h-[155px] min-h-[70px] md:h-[145px] mb-2 md:mb-1 mx-auto"
        >
          {logoUrl && !imageError ? (
            <div className="w-full max-w-[200px] h-full flex items-center justify-center mx-auto p-1">
              <img
                src={logoUrl}
                alt={clubName || "Vereinslogo"}
                className="max-h-[85px] md:max-h-[130px] max-w-[150px] md:max-w-[185px] object-contain drop-shadow-sm select-none"
                onError={() => setImageError(true)}
              />
            </div>
          ) : !lottieFailed && animationData ? (
            <div className="hidden md:flex w-full max-w-[200px] h-full items-center justify-center mx-auto">
              <LottieComponent
                src={animationData}
                loop={true}
                autoplay={true}
                style={{ width: "100%", height: "100%" }}
              />
            </div>
          ) : !lottieFailed ? (
            <div className="w-full max-w-[200px] h-full flex items-center justify-center mx-auto">
              <div
                className="w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center shadow-inner animate-pulse mx-auto"
                style={{ backgroundColor: `${primaryColor}15` }}
              >
                <Sparkles className="w-6 h-6 md:w-7 md:h-7" style={{ color: primaryColor }} />
              </div>
            </div>
          ) : (
            <div
              className="w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center shadow-inner mx-auto"
              style={{ backgroundColor: `${primaryColor}15` }}
            >
              <Sparkles className="w-6 h-6 md:w-7 md:h-7" style={{ color: primaryColor }} />
            </div>
          )}
        </div>
      )}

      {/* Welcome Title in Playfair Display / Serif */}
      <h2
        id="onboarding-welcome-title"
        className="font-serif text-xl lg:text-2xl font-semibold text-slate-900 tracking-tight leading-snug whitespace-pre-line"
      >
        {welcomeTitle || "Willkommen in unserem Tennisclub!"}
      </h2>

      {/* Welcome Description Body Text in Clean Sans - Barrierefreies Dunkelgrau (#4B5563 / text-slate-600) */}
      <p
        id="onboarding-welcome-desc"
        className="font-sans text-xs sm:text-sm font-normal text-slate-600 leading-relaxed max-w-md break-words whitespace-pre-line"
      >
        {welcomeDescription ||
          "Wir freuen uns, dich auf unserer modernen Plattform zu begrüßen. Bitte nimm dir kurz Zeit, deine Stammdaten zu überprüfen und bei Bedarf zu aktualisieren."}
      </p>
    </div>
  );
};

export default OnboardingHero;
