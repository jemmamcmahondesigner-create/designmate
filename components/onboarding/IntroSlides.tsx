"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TransitionEvent,
} from "react";
import { AuthMark } from "@/components/auth/AuthMark";
import { Button } from "@/components/ui/ds";
import { DesignTraceName } from "./DesignTraceName";
import "./onboarding.css";

// 🖼️ SWAP IMAGES HERE — replace src values when final images are ready. One entry per slide.
const SLIDE_IMAGES = [
  { src: "/images/onboarding/slide-2.jpg", alt: "" },
  { src: "/images/onboarding/slide-3.jpg", alt: "" },
  { src: "/images/onboarding/slide-4.jpg", alt: "" },
  { src: "/images/onboarding/slide-5.jpg", alt: "" },
  { src: "/images/onboarding/slide-6.jpg", alt: "" },
] as const;

const IMAGE_FALLBACK_BACKGROUND =
  "radial-gradient(ellipse at 30% 50%, #a0384f 0%, #6b1e2e 40%, #2a0812 100%)";

const MAX_TRAIL_POINTS = 40;
const TRAIL_MIN_DISTANCE_PX = 24;
const TRAIL_SQUARE_SIZE = 16;
const TRAIL_SQUARE_OFFSET = TRAIL_SQUARE_SIZE / 2;

const HEADING_FONT_MULTI = "clamp(28px, 3.5vw, 48px)";
const HEADING_FONT_WELCOME = "clamp(28px, 3.5vw, 48px)";
const SUB_FONT = "clamp(16px, 2vw, 28px)";

const INTRO_LOADING_MS = 3000;
const INTRO_WELCOME_ANIM_MS = 800;
const INTRO_WELCOME_SETTLE_MS = 1200;
/** Right-panel slide-in duration (Phase 3). */
const INTRO_SPLIT_MS = 1000;
const INTRO_CONTENT_PAUSE_MS = 600;

/** Scoped intro overrides (single-file edit); avoids relying on stale onboarding.css selectors. */
const INTRO_UI_CSS = `
@keyframes intro-logo-bounce-up {
  0%   { transform: translateY(0px); }
  45%  { transform: translateY(-72px); }
  65%  { transform: translateY(-44px); }
  80%  { transform: translateY(-60px); }
  90%  { transform: translateY(-52px); }
  100% { transform: translateY(-56px); }
}

.intro-ui-split {
  display: flex;
  height: 100%;
  width: 100%;
  position: relative;
  z-index: 2;
}

.intro-ui-left {
  flex: 0 0 50%;
  min-width: 0;
  overflow: hidden;
  background: #faf8f6;
  display: flex;
  align-items: center;
  padding-left: 64px;
  padding-right: 64px;
}

.intro-ui-heading-wrap {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 800ms ease, transform 800ms ease;
}

[data-intro-ui-phase="welcome-appear"] .intro-ui-heading-wrap,
[data-intro-ui-phase="welcome-settle"] .intro-ui-heading-wrap,
[data-intro-ui-phase="split"] .intro-ui-heading-wrap,
[data-intro-ui-phase="content-ready"] .intro-ui-heading-wrap {
  opacity: 1;
  transform: translateY(0);
}

.intro-ui-right {
  position: relative;
  flex: 0 0 50%;
  min-width: 0;
  overflow: hidden;
  background: #1a0810;
  transform: translateX(100%);
  opacity: 0;
  transition: transform 1000ms cubic-bezier(0.25, 0.1, 0.25, 1), opacity 300ms ease;
}

[data-intro-ui-phase="split"] .intro-ui-right,
[data-intro-ui-phase="content-ready"] .intro-ui-right {
  transform: translateX(0);
  opacity: 1;
}

.intro-ui-logo-layer {
  position: fixed;
  inset: 0;
  z-index: 6;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.intro-ui-logo-shift {
  display: flex;
  justify-content: center;
}

[data-intro-ui-phase="welcome-appear"] .intro-ui-logo-shift {
  animation: intro-logo-bounce-up 1100ms ease-in-out forwards;
}

[data-intro-ui-phase="welcome-settle"] .intro-ui-logo-shift {
  transform: translateY(-56px);
}

[data-intro-ui-phase="split"] .intro-ui-logo-shift,
[data-intro-ui-phase="content-ready"] .intro-ui-logo-shift {
  animation: none;
  transform: translateY(-56px);
  opacity: 0;
  transition: opacity 300ms ease;
}

.intro-ui-overlay-copy {
  position: absolute;
  top: 50%;
  left: 40px;
  right: 40px;
  transform: translateY(-50%);
  z-index: 1;
  margin: 0;
  opacity: 0;
  pointer-events: none;
  white-space: normal;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

[data-intro-ui-phase="content-ready"] .intro-ui-overlay-copy {
  opacity: 1;
  transition: opacity 500ms ease;
}
`;

type TransitionState = "idle" | "wiping-in" | "revealing";

type IntroPhase =
  | "loading"
  | "welcome-appear"
  | "welcome-settle"
  | "split"
  | "content-ready";

type IntroSlidesProps = {
  reducedMotion: boolean;
  exiting?: boolean;
  onComplete: () => void;
};

type SlideConfig = {
  imageOnLeft: boolean;
  showImageOverlay: boolean;
  text: ReactNode;
};

function SlideHeading({ children }: { children: ReactNode }) {
  return (
    <h1
      className="m-0 font-extrabold"
      style={{
        fontSize: HEADING_FONT_MULTI,
        lineHeight: 1.15,
        letterSpacing: "-1.44px",
        color: "var(--text-heading, #6b1e2e)",
      }}
    >
      {children}
    </h1>
  );
}

function SlideSub({ children }: { children: ReactNode }) {
  return (
    <p
      className="m-0 mt-6 font-light"
      style={{
        fontSize: SUB_FONT,
        lineHeight: 1.35,
        letterSpacing: "-0.84px",
        color: "var(--text-secondary, #6b5e55)",
      }}
    >
      {children}
    </p>
  );
}

function WelcomeHeading({ centered = false }: { centered?: boolean }) {
  return (
    <h1
      className={`m-0 font-extrabold ${centered ? "onboarding-welcome-heading-centered" : "onboarding-welcome-heading-split"}`}
      style={{
        fontSize: "48px",
        lineHeight: 1.15,
        letterSpacing: "-1.44px",
        color: "var(--text-heading, #6b1e2e)",
      }}
    >
      Welcome to <DesignTraceName />
    </h1>
  );
}

function ImageOverlayText({ className }: { className?: string }) {
  return (
    <h1
      className={`m-0 text-white ${className ?? ""}`}
      style={{
        fontSize: 48,
        fontWeight: 700,
        lineHeight: 1.15,
        letterSpacing: "-1.44px",
        textShadow: "0 2px 12px rgba(0,0,0,0.4)",
        whiteSpace: "normal",
        wordWrap: "break-word",
        overflowWrap: "break-word",
        flexShrink: 0,
      }}
    >
      <span className="font-extrabold">your </span>
      <span className="font-light" style={{ color: "#ebc5ed" }}>
        ai
      </span>
      <span className="font-extrabold"> design memory</span>
    </h1>
  );
}

const SLIDES: SlideConfig[] = [
  {
    imageOnLeft: false,
    showImageOverlay: true,
    text: <WelcomeHeading />,
  },
  {
    imageOnLeft: true,
    showImageOverlay: false,
    text: (
      <>
        <SlideHeading>Capture the thinking behind your work</SlideHeading>
        <SlideSub>
          Keep rationale, feedback and context connected as designs evolve.
        </SlideSub>
      </>
    ),
  },
  {
    imageOnLeft: false,
    showImageOverlay: false,
    text: (
      <>
        <SlideHeading>Turn scattered feedback into structured memory</SlideHeading>
        <SlideSub>
          Track what was discussed, what changed, and why it mattered.
        </SlideSub>
      </>
    ),
  },
  {
    imageOnLeft: true,
    showImageOverlay: false,
    text: (
      <>
        <SlideHeading>
          <span className="font-light" style={{ color: "#a0384f" }}>
            Trace{" "}
          </span>
          decisions back to the problem
        </SlideHeading>
        <SlideSub>
          See the path from user need, to trade-off, to final direction.
        </SlideSub>
      </>
    ),
  },
  {
    imageOnLeft: false,
    showImageOverlay: false,
    text: (
      <>
        <SlideHeading>
          Faster iteration.
          <br />
          Clearer decisions.
          <br />
          Shared memory.
        </SlideHeading>
        <SlideSub>
          <DesignTraceName textColor="#6b5e55" /> keeps your team aligned as the work evolves.
        </SlideSub>
      </>
    ),
  },
];

const SLIDE_COUNT = SLIDES.length;

function ImagePanelContent({
  activeSlideIndex,
  showOverlay,
  overlayWrapperClassName,
}: {
  activeSlideIndex: number;
  showOverlay: boolean;
  /** Wrapper around overlay copy (intro uses layout-specific positioning). */
  overlayWrapperClassName?: string;
}) {
  const [failedIndices, setFailedIndices] = useState<Set<number>>(() => new Set());

  return (
    <>
      {SLIDE_IMAGES.map((image, index) => {
        const isActive = index === activeSlideIndex;
        const failed = failedIndices.has(index);

        if (failed) {
          return (
            <div
              key={image.src}
              className="absolute inset-0 h-full w-full"
              style={{
                background: IMAGE_FALLBACK_BACKGROUND,
                opacity: isActive ? 1 : 0,
                pointerEvents: "none",
              }}
              aria-hidden={!isActive}
            />
          );
        }

        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={image.src}
            src={image.src}
            alt={image.alt}
            className="onboarding-slide-image absolute inset-0 h-full w-full object-cover"
            style={{
              opacity: isActive ? 1 : 0,
              pointerEvents: "none",
            }}
            aria-hidden={!isActive}
            onError={() => {
              setFailedIndices((prev) => new Set(prev).add(index));
            }}
          />
        );
      })}
      {showOverlay ? (
        <div className={overlayWrapperClassName ?? "intro-overlay-copy"}>
          <ImageOverlayText />
        </div>
      ) : null}
    </>
  );
}

function ImagePanelColumn({
  slideIndex,
  showOverlay,
  overlayWrapperClassName,
  wipeAnchor,
  wipeWidth,
  onWipeTransitionEnd,
}: {
  slideIndex: number;
  showOverlay: boolean;
  overlayWrapperClassName?: string;
  wipeAnchor: "left" | "right";
  wipeWidth: "0%" | "100%";
  onWipeTransitionEnd: (event: TransitionEvent<HTMLDivElement>) => void;
}) {
  return (
    <div className="relative h-full min-w-0 flex-1 basis-0 overflow-hidden">
      <div className="relative h-full w-full overflow-hidden bg-[#1a0810]">
        <ImagePanelContent
          activeSlideIndex={slideIndex}
          showOverlay={showOverlay}
          overlayWrapperClassName={overlayWrapperClassName}
        />
        <div
          className={`onboarding-wipe onboarding-wipe-anchor-${wipeAnchor}`}
          style={{ width: wipeWidth }}
          onTransitionEnd={onWipeTransitionEnd}
        />
      </div>
    </div>
  );
}

export function IntroSlides({ reducedMotion, exiting = false, onComplete }: IntroSlidesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const trailPointsRef = useRef<{ x: number; y: number }[]>([]);
  const pendingSlideRef = useRef<number | null>(null);

  const [slideIndex, setSlideIndex] = useState(0);
  const [transitionState, setTransitionState] = useState<TransitionState>("idle");
  const [wipeWidth, setWipeWidth] = useState<"0%" | "100%">("0%");
  const [wipeAnchor, setWipeAnchor] = useState<"left" | "right">("left");
  const [copyVisible, setCopyVisible] = useState(false);
  const [copyFadingOut, setCopyFadingOut] = useState(false);
  const [introPhase, setIntroPhase] = useState<IntroPhase>("loading");
  const [isCompleting, setIsCompleting] = useState(false);

  const slide = SLIDES[slideIndex];
  const isLastSlide = slideIndex === SLIDE_COUNT - 1;
  const isTransitioning = transitionState !== "idle";
  const buttonsOnDarkPanel = !slide.imageOnLeft;

  useEffect(() => {
    if (reducedMotion) return;
    const img = new Image();
    img.src = SLIDE_IMAGES[0]?.src ?? "";
  }, []);

  useEffect(() => {
    if (reducedMotion) return;

    const welcomeAppearAt = INTRO_LOADING_MS;
    const welcomeSettleAt = INTRO_LOADING_MS + INTRO_WELCOME_ANIM_MS;
    const splitAt = INTRO_LOADING_MS + INTRO_WELCOME_ANIM_MS + INTRO_WELCOME_SETTLE_MS;
    const contentReadyAt = splitAt + INTRO_SPLIT_MS + INTRO_CONTENT_PAUSE_MS;

    const welcomeTimer = window.setTimeout(() => {
      setIntroPhase("welcome-appear");
    }, welcomeAppearAt);
    const settleTimer = window.setTimeout(() => {
      setIntroPhase("welcome-settle");
    }, welcomeSettleAt);
    const splitTimer = window.setTimeout(() => {
      setIntroPhase("split");
    }, splitAt);
    const contentTimer = window.setTimeout(() => {
      setIntroPhase("content-ready");
    }, contentReadyAt);

    return () => {
      window.clearTimeout(welcomeTimer);
      window.clearTimeout(settleTimer);
      window.clearTimeout(splitTimer);
      window.clearTimeout(contentTimer);
    };
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion) {
      onComplete();
    }
  }, [reducedMotion, onComplete]);

  const completeIntro = useCallback(() => {
    if (isCompleting) return;
    setIsCompleting(true);
    if (reducedMotion) {
      onComplete();
      return;
    }
    window.setTimeout(() => {
      onComplete();
    }, 300);
  }, [isCompleting, onComplete, reducedMotion]);

  const startCopyEnter = useCallback(() => {
    setCopyFadingOut(false);
    setCopyVisible(false);
    requestAnimationFrame(() => {
      setCopyVisible(true);
    });
  }, []);

  useEffect(() => {
    if (slideIndex === 0 && !reducedMotion && introPhase === "content-ready") {
      startCopyEnter();
    }
  }, [slideIndex, reducedMotion, introPhase, startCopyEnter]);

  const handleWipeTransitionEnd = useCallback(
    (event: TransitionEvent<HTMLDivElement>) => {
      if (reducedMotion || event.propertyName !== "width") return;

      if (transitionState === "wiping-in" && wipeWidth === "100%") {
        const nextIndex = pendingSlideRef.current;
        if (nextIndex === null) return;

        const nextSlide = SLIDES[nextIndex];
        setSlideIndex(nextIndex);
        pendingSlideRef.current = null;

        setTransitionState("revealing");
        setWipeAnchor(nextSlide.imageOnLeft ? "left" : "right");
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setWipeWidth("0%"));
        });
        return;
      }

      if (transitionState === "revealing" && wipeWidth === "0%") {
        setTransitionState("idle");
        startCopyEnter();
      }
    },
    [reducedMotion, transitionState, wipeWidth, startCopyEnter],
  );

  const goToSlide = useCallback(
    (nextIndex: number) => {
      if (isTransitioning || isCompleting) return;

      const currentSlide = SLIDES[slideIndex];

      if (reducedMotion) {
        setSlideIndex(nextIndex);
        setCopyVisible(true);
        return;
      }

      pendingSlideRef.current = nextIndex;
      setCopyFadingOut(true);
      setTransitionState("wiping-in");
      setWipeAnchor(currentSlide.imageOnLeft ? "right" : "left");
      setWipeWidth("0%");
      if (slideIndex === 0) {
        setSlideIndex(nextIndex);
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setWipeWidth("100%"));
      });
    },
    [isTransitioning, isCompleting, reducedMotion, slideIndex],
  );

  const handleNext = useCallback(() => {
    if (isLastSlide) {
      completeIntro();
      return;
    }
    goToSlide(slideIndex + 1);
  }, [isLastSlide, completeIntro, goToSlide, slideIndex]);

  const resizeCanvas = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const { width, height } = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }, []);

  const drawTrail = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    const points = trailPointsRef.current;
    if (points.length === 0) return;

    const imageOnLeft = slide.imageOnLeft;
    const midX = window.innerWidth / 2;

    for (let i = 0; i < points.length; i += 1) {
      const point = points[i]!;
      const prevPoint = i > 0 ? points[i - 1]! : point;
      const alpha = points.length === 1 ? 1 : i / (points.length - 1);

      const overImagePanel = imageOnLeft ? point.x < midX : point.x >= midX;
      const px = point.x - rect.left;
      const py = point.y - rect.top;

      if (overImagePanel) {
        ctx.fillStyle = `rgba(250, 248, 246, ${alpha})`;
      } else {
        ctx.fillStyle = `rgba(160, 56, 79, ${alpha})`;
      }

      const angle = Math.atan2(point.y - prevPoint.y, point.x - prevPoint.x);

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);
      ctx.fillRect(-TRAIL_SQUARE_OFFSET, -TRAIL_SQUARE_OFFSET, TRAIL_SQUARE_SIZE, TRAIL_SQUARE_SIZE);
      ctx.restore();
    }
  }, [slide.imageOnLeft]);

  const scheduleTrailDraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      drawTrail();
    });
  }, [drawTrail]);

  useEffect(() => {
    if (reducedMotion) return;

    resizeCanvas();
    const onResize = () => resizeCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [reducedMotion, resizeCanvas]);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (
        slideIndex === 0 &&
        (introPhase === "split" || introPhase === "content-ready")
      ) {
        return;
      }
      const points = trailPointsRef.current;
      const last = points[points.length - 1];
      if (last) {
        const dx = e.clientX - last.x;
        const dy = e.clientY - last.y;
        if (dx * dx + dy * dy < TRAIL_MIN_DISTANCE_PX * TRAIL_MIN_DISTANCE_PX) {
          return;
        }
      }
      points.push({ x: e.clientX, y: e.clientY });
      if (points.length > MAX_TRAIL_POINTS) {
        points.shift();
      }
      scheduleTrailDraw();
    },
    [scheduleTrailDraw, slideIndex, introPhase],
  );

  useEffect(() => {
    if (reducedMotion) return;

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [reducedMotion, handleMouseMove]);

  useEffect(() => {
    trailPointsRef.current = [];
    drawTrail();
  }, [slideIndex, drawTrail]);

  useEffect(() => {
    if (introPhase === "split" || introPhase === "content-ready") {
      trailPointsRef.current = [];
      drawTrail();
    }
  }, [introPhase, drawTrail]);

  useEffect(() => {
    if (transitionState !== "revealing" || reducedMotion) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setWipeWidth("0%"));
    });
  }, [transitionState, slideIndex, reducedMotion]);

  if (reducedMotion) {
    return null;
  }

  const copyClassName = [
    copyFadingOut ? "onboarding-copy-fade-out" : "",
    !copyFadingOut && copyVisible && slideIndex !== 0 ? "onboarding-copy-enter" : "",
    !copyFadingOut && !copyVisible && slideIndex !== 0 ? "onboarding-copy-hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const isWelcomeIntroLayout = slideIndex === 0 && transitionState === "idle";
  const introControlsVisible = !isWelcomeIntroLayout || introPhase === "content-ready";
  const introSlideButtonDisabled = isCompleting;
  const slideButtonDisabled = isTransitioning || isCompleting;

  const imageColumn = (
    <ImagePanelColumn
      key="intro-image-panel"
      slideIndex={slideIndex}
      showOverlay={slide.showImageOverlay}
      wipeAnchor={wipeAnchor}
      wipeWidth={wipeWidth}
      onWipeTransitionEnd={handleWipeTransitionEnd}
    />
  );

  const textColumn = (
    <div
      key="intro-text-panel"
      className="flex h-full min-w-0 flex-1 basis-0 items-center px-16"
      style={{ background: "var(--surface-page, #faf8f6)" }}
    >
      <div className={`w-full text-left ${copyClassName}`.trim()}>{slide.text}</div>
    </div>
  );

  const introTrailHidden =
    slideIndex === 0 && (introPhase === "split" || introPhase === "content-ready");

  return (
    <div
      ref={containerRef}
      className={[
        "fixed inset-0 z-50 h-screen w-screen cursor-auto",
        exiting || isCompleting ? "onboarding-intro-exit" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <canvas
        ref={canvasRef}
        className="onboarding-cursor-trail-canvas"
        style={{
          zIndex: slideIndex === 0 ? 0 : 15,
          opacity: introTrailHidden ? 0 : 1,
          visibility: introTrailHidden ? "hidden" : "visible",
        }}
        aria-hidden
      />

      {isWelcomeIntroLayout ? (
        <>
          <style dangerouslySetInnerHTML={{ __html: INTRO_UI_CSS }} />
          <div data-intro-ui-phase={introPhase}>
            <div className="intro-ui-split">
              <div className="intro-ui-left">
                <div className="intro-ui-heading-wrap">
                  <WelcomeHeading />
                </div>
              </div>
              <div className="intro-ui-right">
                <ImagePanelContent
                  activeSlideIndex={0}
                  showOverlay={slide.showImageOverlay}
                  overlayWrapperClassName="intro-ui-overlay-copy"
                />
              </div>
            </div>
            <div className="intro-ui-logo-layer">
              <div className="intro-ui-logo-shift">
                <AuthMark height={80} squareBlink={introPhase === "loading"} />
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="flex h-full w-full">
          {slide.imageOnLeft ? (
            <>
              {imageColumn}
              {textColumn}
            </>
          ) : (
            <>
              {textColumn}
              {imageColumn}
            </>
          )}
        </div>
      )}

      <div
        className={[
          "fixed bottom-8 right-8 z-50 flex flex-row items-center gap-2",
          introControlsVisible ? "intro-content-fade" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          introControlsVisible
            ? undefined
            : { opacity: 0, pointerEvents: "none" }
        }
      >
        {!isLastSlide ? (
          <Button
            variant={buttonsOnDarkPanel ? "ghost-on-dark" : "ghost"}
            size="lg"
            label="Skip intro"
            disabled={isWelcomeIntroLayout ? introSlideButtonDisabled : slideButtonDisabled}
            onClick={completeIntro}
            style={
              buttonsOnDarkPanel
                ? { border: "none", boxShadow: "none" }
                : undefined
            }
          />
        ) : null}
        <Button
          variant={buttonsOnDarkPanel ? "primary-on-dark" : "primary"}
          size="lg"
          label={isLastSlide ? "Get Started" : "Next"}
          icon="trailing"
          iconName="chevron-right"
          disabled={isWelcomeIntroLayout ? introSlideButtonDisabled : slideButtonDisabled}
          onClick={() => {
            if (slideIndex === 0 && !isLastSlide) {
              console.log("intro next clicked");
            }
            handleNext();
          }}
          style={
            buttonsOnDarkPanel
              ? undefined
              : {
                  backgroundColor: "#6b1e2e",
                  borderColor: "#6b1e2e",
                  color: "#ffffff",
                }
          }
        />
      </div>
    </div>
  );
}
