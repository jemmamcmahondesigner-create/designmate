"use client";

import { useEffect, useState } from "react";
import styles from "./ArtifactPreview.module.css";

type OgPreviewData = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  favicon: string | null;
};

export function LinkOgPreviewCard({
  url,
  hostname,
  fallbackFavicon,
}: {
  url: string;
  hostname: string;
  fallbackFavicon: string;
  canOpenPreview?: boolean;
  onOpen?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<OgPreviewData | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const response = await fetch(
          `/api/og-preview?url=${encodeURIComponent(url)}`,
        );
        const data = (await response.json()) as OgPreviewData;
        if (!cancelled) {
          setPreview(data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setPreview(null);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  const faviconSrc = preview?.favicon || fallbackFavicon;
  const ogTitle = preview?.title?.trim() || "";
  const description = preview?.description?.trim() || "";
  const hasOgImage = Boolean(preview?.imageUrl);

  if (loading) {
    return (
      <div
        className={styles.linkOgSkeleton}
        aria-busy="true"
        aria-label="Loading link preview"
      />
    );
  }

  if (!hasOgImage) {
    return (
      <div className={styles.linkOgCenteredFallback}>
        <div className={styles.linkOgCenteredInner}>
          {faviconSrc ? (
            <img
              src={faviconSrc}
              alt=""
              width={24}
              height={24}
              className={styles.linkOgCenteredFavicon}
              loading="lazy"
            />
          ) : null}
          {hostname ? (
            <span className={styles.linkOgCenteredDomain}>{hostname}</span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.linkOgCardWithImage}>
      <div className={styles.linkOgImageFrame}>
        <img
          src={preview?.imageUrl ?? ""}
          alt=""
          className={styles.linkOgImageNatural}
          loading="lazy"
        />
      </div>
      <div className={styles.linkOgContent}>
        <div className={styles.linkOgMetaRow}>
          <span className={styles.linkOgMetaLeft}>
            {faviconSrc ? (
              <img
                src={faviconSrc}
                alt=""
                width={16}
                height={16}
                className={styles.linkOgFooterFavicon}
                loading="lazy"
              />
            ) : null}
            {hostname ? (
              <span className={styles.linkOgDomain}>{hostname}</span>
            ) : null}
          </span>
        </div>
        {ogTitle ? <span className={styles.linkOgTitle}>{ogTitle}</span> : null}
        {description ? (
          <span className={styles.linkOgDescription}>{description}</span>
        ) : null}
      </div>
    </div>
  );
}
