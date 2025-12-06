import { useEffect, useState } from "react";

export const NotesLoader = () => {
  const [shouldFade, setShouldFade] = useState(false);
  const [isMounted, setIsMounted] = useState(true);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => setShouldFade(true), 1500);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  if (!isMounted) return null;

  return (
    <div
      className={`notes-loader ${shouldFade ? "loader-hidden" : ""}`}
      role="status"
      aria-live="polite"
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === "opacity" && shouldFade) {
          setIsMounted(false);
        }
      }}
    >
      <div className="notes-loader__star" style={{ width: "2px", height: "2px", top: "20%", left: "20%" }} aria-hidden />
      <div
        className="notes-loader__star"
        style={{ width: "3px", height: "3px", top: "15%", right: "25%", animationDelay: "0.5s" }}
        aria-hidden
      />
      <div
        className="notes-loader__star"
        style={{ width: "2px", height: "2px", top: "40%", left: "80%", animationDelay: "1s" }}
        aria-hidden
      />

      <div className="notes-loader__plane" aria-hidden>
        <svg className="notes-loader__plane-svg" viewBox="0 0 512 512">
          <path d="M498.1 5.6c10.1 7 15.4 19.1 13.5 31.2l-64 416c-1.5 9.7-7.4 18.2-16 23s-18.9 5.4-28 1.6L284 427.7l-68.5 74.1c-8.9 9.7-22.9 12.9-35.2 8.1S160 493.2 160 480V396.4c0-4 1.5-7.8 4.2-10.7L331.8 202.8c5.8-6.3 5.6-16-.4-22s-15.7-6.4-22-.7L106 360.8 17.7 316.6C7.1 311.3 .3 300.7 0 288.9s5.9-22.8 16.1-28.7l448-256c10.7-6.1 23.9-5.5 34 1.4z" />
        </svg>
      </div>

      <div className="notes-loader__text">
        <span className="notes-loader__title">Flight Logs</span>
        <span className="notes-loader__subtitle">Accessing notes...</span>
      </div>
    </div>
  );
};
