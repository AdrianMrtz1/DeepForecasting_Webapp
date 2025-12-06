import { useEffect, useState } from "react";

export const FlightLoader = () => {
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
      className={`flight-loader ${shouldFade ? "loader-hidden" : ""}`}
      role="status"
      aria-live="polite"
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === "opacity" && shouldFade) {
          setIsMounted(false);
        }
      }}
    >
      <div className="flight-loader__cloud flight-loader__cloud--1" aria-hidden />
      <div className="flight-loader__cloud flight-loader__cloud--2" aria-hidden />
      <div className="flight-loader__cloud flight-loader__cloud--3" aria-hidden />

      <div className="flight-loader__plane" aria-hidden>
        <svg className="flight-loader__plane-svg" viewBox="0 0 576 512" xmlns="http://www.w3.org/2000/svg">
          <path d="M482.3 192c34.2 0 93.7 29 93.7 64c0 36-59.5 64-93.7 64l-116.6 0L265.2 495.9c-5.7 10-16.3 16.1-27.8 16.1l-56.2 0c-10.6 0-18.3-10.2-15.4-20.4l49-171.6L112 320 68.8 377.6c-3 4-7.8 6.4-12.8 6.4l-42 0c-7.8 0-14-6.3-14-14c0-1.3 .2-2.6 .5-3.9L32 256 .5 145.9c-.4-1.3-.5-2.6-.5-3.9c0-7.7 6.2-14 14-14l42 0c5 0 9.8 2.4 12.8 6.4L112 192l102.9 0-49-171.6C162.9 10.2 170.6 0 181.2 0l56.2 0c11.5 0 22.1 6.1 27.8 16.1L365.7 192l116.6 0z" />
        </svg>
      </div>

      <div className="flight-loader__name">
        <span className="sr-only">Loading</span>
        Deep Cast
      </div>
    </div>
  );
};
