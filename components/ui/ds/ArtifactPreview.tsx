'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { ArtifactFullscreenModal, type ArtifactFullscreenPayload } from '@/components/ArtifactFullscreenModal';
import {
  openArtifactTarget,
  resolveArtifactOpenTarget,
} from '@/lib/artifacts/artifactOpenTarget';
import { Divider } from './Divider';
import { Icon } from './Icon';
import { Select } from './Select';
import { Tag } from './Tag';
import { Tooltip } from './Tooltip';
import { Textarea } from './Textarea';
import { TextareaAi } from './TextareaAi';
import textareaStyles from './Textarea.module.css';
import styles from './ArtifactPreview.module.css';

export type ArtifactPreviewSize = 'large' | 'small';
export type ArtifactPreviewFileType =
  | 'figma'
  | 'pdf'
  | 'jpg'
  | 'jpeg'
  | 'png'
  | 'gif'
  | 'webp'
  | 'svg'
  | 'link'
  | 'generic';
export type ArtifactPreviewMode = 'editable' | 'readonly';

/** Figma “Artifact History” drawer card — grey preview chrome, file bar, recessed meta + details. */
export type ArtifactPreviewState = 'default' | 'artifact-history';

export type ArtifactDescriptionState =
  | 'idle'
  | 'loading'
  | 'ai_generated'
  | 'edited'
  | 'error';

function isFigmaUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'www.figma.com' || u.hostname === 'figma.com';
  } catch {
    return false;
  }
}

function buildFigmaEmbedUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return url;
  if (/figma\.com\/embed/i.test(trimmed)) return trimmed;
  if (!isFigmaUrl(trimmed)) return url;
  return `https://www.figma.com/embed?embed_host=designtrace&url=${encodeURIComponent(trimmed)}`;
}

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || '';
  } catch {
    return '';
  }
}

/** Maps legacy "Iteration N" labels to `vN` for version tags. */
function displayVersionTagLabel(iteration: string): string {
  const t = iteration.trim();
  const legacy = /^iteration\s*(\d+)$/i.exec(t);
  if (legacy) return `v${legacy[1]}`;
  return t;
}

function resolveVersionSelectValue(iteration: string, iterationOptions: string[]) {
  const trimmed = iteration.trim();
  if (!trimmed) return undefined;
  const normalized = displayVersionTagLabel(trimmed);
  const exact = iterationOptions.find(
    (opt) => opt === trimmed || opt === normalized,
  );
  if (exact) return exact;
  const byDisplay = iterationOptions.find(
    (opt) => displayVersionTagLabel(opt) === normalized,
  );
  return byDisplay ?? normalized;
}

function ExternalLinkGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M14 3h7v7M10 14 21 3M21 14v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function isGoogleWorkspaceUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname.includes('docs.google.com');
  } catch {
    return false;
  }
}

function buildGoogleEmbedUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('docs.google.com')) return url;
    const match = parsed.pathname.match(
      /^(\/(?:document|spreadsheets|presentation)\/d\/[^/]+)(?:\/.*)?$/,
    );
    if (match) {
      parsed.pathname = `${match[1]}/preview`;
      return parsed.toString();
    }
    return url;
  } catch {
    return url;
  }
}

function EmbedPreviewFallback() {
  return (
    <>
      <Icon name="artifact" size={32} style={{ color: "var(--text-disabled, #998c82)" }} />
      <p
        className="text-sm"
        style={{
          color: "var(--text-disabled, #998c82)",
          margin: 0,
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        Preview unavailable
      </p>
    </>
  );
}

function EmbeddableIframe({
  src,
  title,
  size = 'large',
  compact = false,
}: {
  src: string;
  title: string;
  size?: ArtifactPreviewSize;
  compact?: boolean;
}) {
  const [iframeLoaded, setIframeLoaded] = useState(false);

  useEffect(() => {
    setIframeLoaded(false);
  }, [src]);

  const wrapClass = [
    styles.embedWrap,
    size === 'large' && !compact ? styles.embedWrapLarge : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (!src.trim()) {
    return (
      <div className={wrapClass}>
        <div className={styles.embedFallback}>
          <EmbedPreviewFallback />
        </div>
      </div>
    );
  }

  return (
    <div className={wrapClass}>
      <div className={styles.embedFallback} aria-hidden={iframeLoaded}>
        <EmbedPreviewFallback />
      </div>
      <iframe
        src={src}
        title={title}
        className={styles.embedIframe}
        style={{ opacity: iframeLoaded ? 1 : 0 }}
        onLoad={() => setIframeLoaded(true)}
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}

function renderPreviewContent(
  imageUrl?: string,
  linkUrl?: string,
  fileType?: ArtifactPreviewFileType,
  size: ArtifactPreviewSize = 'large',
  compact = false,
): ReactNode {
  const ft = fileType ? String(fileType).toLowerCase() : '';
  if (
    imageUrl &&
    ft &&
    ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ft)
  ) {
    return (
      <img
        src={imageUrl}
        alt="Artifact preview"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
      />
    );
  }

  if (linkUrl && isGoogleWorkspaceUrl(linkUrl)) {
    const embedUrl = buildGoogleEmbedUrl(linkUrl);
    return (
      <EmbeddableIframe
        src={embedUrl}
        title="Google document preview"
        size={size}
        compact={compact}
      />
    );
  }

  if (linkUrl && isFigmaUrl(linkUrl)) {
    const embedUrl = buildFigmaEmbedUrl(linkUrl);
    return (
      <EmbeddableIframe
        src={embedUrl}
        title="Figma preview"
        size={size}
        compact={compact}
      />
    );
  }

  if (imageUrl && ft === 'pdf') {
    return (
      <EmbeddableIframe
        src={imageUrl}
        title="PDF preview"
        size={size}
        compact={compact}
      />
    );
  }

  return null;
}

export interface ArtifactPreviewProps {
  /** Visual size variant */
  size?: ArtifactPreviewSize;
  /** Type of artifact — drives tag label and preview tint */
  fileType?: ArtifactPreviewFileType;
  /** editable = inline form fields in footer (Create Review / Create Decision)
   *  readonly = read-only display in recessed footer (View Review) */
  mode?: ArtifactPreviewMode;
  /**
   * `artifact-history` = large readonly history layout (file bar, recessed footer, optional detail rows).
   * Matches Figma “Artifact History” / `state="Artifact History"`.
   */
  state?: ArtifactPreviewState;
  /** When false, same as readonly for artifact history (Create flow may omit). */
  inlineEditable?: boolean;
  /** Rows below the divider in the recessed footer when `state="artifact-history"` */
  artifactHistoryDetails?: ReactNode;
  /** When set with `artifact-history`, version tag shows `v{N}` (ignores legacy `iteration` strings). */
  historyVersionNumber?: number;
  /** Whether to show the details footer at all */
  showDetails?: boolean;

  // Content
  fileName?: string;
  lastEdited?: string;
  artifactName?: string;
  /** Version label for tags (e.g. `v2`). Prefer `historyVersionNumber` in artifact-history state. */
  iteration?: string;
  description?: string;
  imageUrl?: string;
  /** Original link URL for link artifacts (Figma embed, etc.) */
  linkUrl?: string;
  /** Figma oEmbed title + edited label when available */
  figmaFileMeta?: { fileName: string; lastEdited: string } | null;

  // Version select options (v1…vN in Create Review)
  iterationOptions?: string[];

  // Callbacks
  onArtifactNameChange?: (value: string) => void;
  onIterationChange?: (value: string) => void;
  onDescriptionChange?: (value: string) => void;
  onDescriptionBlur?: () => void;
  /** Minimise / remove artifact (editable mode trash control) */
  onMinimise?: () => void;
  /** When true, trash is visible but disabled (e.g. artifact has feedback). */
  removeDisabled?: boolean;
  /** Tooltip when `removeDisabled` is true. */
  removeDisabledTooltip?: string;
  /** Create Review validation — error border on name when empty after submit attempt */
  highlightNameError?: boolean;
  /** Create Review validation — error border on iteration control when empty */
  highlightIterationError?: boolean;

  /** AI-assisted description (TextareaAi). Omit to keep a plain description field (no AI chrome). */
  descriptionAiState?: ArtifactDescriptionState;
  /** Link URL, preview blob URL, or file name present — required to offer AI actions. */
  canGenerateAiDescription?: boolean;
  onRegenerateDescription?: () => void;
  /** From persisted review data (e.g. jsonb) — used for optimise vs generate behaviour. */
  persistedAiGenerated?: boolean;
  /** Review detail only: hide optimise until the user edits persisted AI text. */
  requireUserEditBeforeOptimise?: boolean;
  /** Reset user-edit tracking when the artifact identity changes. */
  aiEditTrackingKey?: string;
  /** When false, never show Optimise/Generate AI on the description field (e.g. Create Review drawer). */
  showOptimiseButton?: boolean;
  /** Compact 220px preview (create review drawer). Default is full-height detail preview. */
  compact?: boolean;
  /** Review detail: thumbnail and title open URL or fullscreen preview. */
  enableOpenInteraction?: boolean;

  className?: string;
}

export function ArtifactPreview({
  size = 'large',
  fileType = 'figma',
  mode = 'editable',
  state = 'default',
  inlineEditable: _inlineEditable = true,
  artifactHistoryDetails,
  historyVersionNumber,
  showDetails = true,
  fileName = 'Untitled',
  lastEdited,
  artifactName = '',
  iteration = '',
  description = '',
  imageUrl,
  linkUrl,
  figmaFileMeta = null,
  iterationOptions = [],
  onArtifactNameChange,
  onIterationChange,
  onDescriptionChange,
  onDescriptionBlur,
  onMinimise,
  removeDisabled = false,
  removeDisabledTooltip,
  highlightNameError = false,
  highlightIterationError = false,
  descriptionAiState = 'idle',
  canGenerateAiDescription = false,
  onRegenerateDescription,
  persistedAiGenerated = false,
  requireUserEditBeforeOptimise = false,
  aiEditTrackingKey,
  showOptimiseButton = true,
  compact = false,
  enableOpenInteraction = false,
  className,
}: ArtifactPreviewProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const [isUserEdited, setIsUserEdited] = useState(!persistedAiGenerated);
  const [fullscreenPayload, setFullscreenPayload] =
    useState<ArtifactFullscreenPayload | null>(null);
  const lastOpenTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setIsUserEdited(!persistedAiGenerated);
  }, [aiEditTrackingKey, persistedAiGenerated]);

  const openTarget = resolveArtifactOpenTarget({
    linkUrl,
    imageUrl,
    fileType,
  });
  const canOpenPreview = enableOpenInteraction && openTarget != null;
  const openPreview = useCallback(() => {
    if (!openTarget) return;
    if (openTarget.kind === 'external') {
      openArtifactTarget(openTarget);
      return;
    }
    setFullscreenPayload(openTarget);
  }, [openTarget]);

  const isSmall = size === 'small';
  const isLarge = size === 'large';
  const isArtifactHistory = state === 'artifact-history';
  const isEditable = mode === 'editable' && !isArtifactHistory;
  const isReadonly = mode === 'readonly' || isArtifactHistory;
  const tagLabelMap: Record<string, string> = {
    figma: 'Figma',
    pdf: 'PDF',
    jpg: 'JPG',
    jpeg: 'JPG',
    png: 'PNG',
    gif: 'GIF',
    webp: 'WebP',
    svg: 'SVG',
    link: 'Link',
    generic: 'File',
  };
  const tagLabel = tagLabelMap[fileType] ?? fileType.toUpperCase();

  const showFigmaMeta =
    Boolean(linkUrl && isFigmaUrl(linkUrl) && figmaFileMeta);

  const isFigmaEmbed = Boolean(
    linkUrl &&
      (linkUrl.includes('figma.com/design/') ||
        linkUrl.includes('figma.com/file/') ||
        linkUrl.includes('figma.com/proto/'))
  );

  /** Non-upload link artifact without embed: compact favicon card. */
  const rawLink = String(linkUrl ?? '').trim();
  const googleWorkspaceLink = rawLink ? isGoogleWorkspaceUrl(rawLink) : false;
  const showGenericLinkCard =
    Boolean(rawLink) &&
    !imageUrl &&
    !isFigmaUrl(rawLink) &&
    !googleWorkspaceLink;
  const linkHostname = showGenericLinkCard ? hostnameFromUrl(rawLink) : '';
  const faviconSrc =
    showGenericLinkCard && linkHostname
      ? `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(linkHostname)}`
      : '';

  const rootClass = [
    styles.root,
    isSmall ? styles.small : styles.large,
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const resolvedPreviewNonLink = showGenericLinkCard
    ? null
    : renderPreviewContent(imageUrl, linkUrl, fileType, size, compact);
  const hasArtifactFilePreviewSource = Boolean(String(imageUrl ?? '').trim());
  const isIframeEmbed = Boolean(
    rawLink &&
      (isFigmaEmbed ||
        googleWorkspaceLink ||
        (resolvedPreviewNonLink != null &&
          !hasArtifactFilePreviewSource &&
          !showGenericLinkCard)),
  );
  const showFileTypeTag =
    !isIframeEmbed &&
    (hasArtifactFilePreviewSource ||
      (String(fileType).toLowerCase() === 'pdf' && Boolean(imageUrl)));
  const showHistoryPlaceholder =
    isArtifactHistory &&
    isLarge &&
    !showGenericLinkCard &&
    resolvedPreviewNonLink == null;

  const historyFileLabel = (() => {
    const t = fileName?.trim() ?? '';
    if (t && t !== 'File') return t;
    return '';
  })();

  const showArtifactHistoryFileBar =
    isArtifactHistory &&
    isLarge &&
    !(Boolean(rawLink) && !hasArtifactFilePreviewSource);

  const showAiLoadingButton = descriptionAiState === 'loading';
  const descTrim = description.trim();
  const hideOptimiseUntilEdited =
    requireUserEditBeforeOptimise &&
    persistedAiGenerated &&
    !isUserEdited &&
    descriptionAiState !== 'edited';
  const showAiButton =
    showOptimiseButton &&
    canGenerateAiDescription &&
    Boolean(onRegenerateDescription) &&
    !showAiLoadingButton &&
    descTrim.length > 0 &&
    !hideOptimiseUntilEdited;

  const aiButtonLabel = 'Optimise with AI';

  const descriptionPlaceholder =
    descriptionAiState === 'error'
      ? "Couldn't generate a description. Add one manually."
      : 'Description';

  const figmaBarPrimaryLabel = (
    artifactName?.trim() ||
    figmaFileMeta?.fileName ||
    ''
  ).trim();

  const historyFileBarInner =
    onRegenerateDescription !== undefined && showFigmaMeta && figmaFileMeta ? (
      <>
        <span className={styles.fileName}>
          {figmaBarPrimaryLabel || '—'}
        </span>
        <span className={styles.lastEdited}>{figmaFileMeta.lastEdited}</span>
      </>
    ) : !(showFigmaMeta && figmaFileMeta) ? (
      <>
        <span
          className={[
            styles.fileName,
            !historyFileLabel ? styles.historyFileNameEmpty : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {historyFileLabel || '—'}
        </span>
        {lastEdited ? (
          <span className={styles.lastEdited}>{lastEdited}</span>
        ) : null}
      </>
    ) : null;

  const historyFileBar =
    showArtifactHistoryFileBar && historyFileBarInner ? (
      <div className={styles.historyFileBar}>{historyFileBarInner}</div>
    ) : null;

  const artifactHistoryVersionTag = ((): string | null => {
    if (historyVersionNumber != null && historyVersionNumber > 0) {
      return `v${historyVersionNumber}`;
    }
    const t = iteration?.trim();
    if (!t) return null;
    return displayVersionTagLabel(t);
  })();

  const interactivePreviewClass = canOpenPreview ? styles.previewInteractive : '';

  return (
    <div className={rootClass}>
      <ArtifactFullscreenModal
        payload={fullscreenPayload}
        onClose={() => {
          setFullscreenPayload(null);
          lastOpenTriggerRef.current?.focus();
        }}
      />
      {/* ── Preview area ── */}
      <div
        className={[
          styles.preview,
          isSmall ? styles.previewSmall : styles.previewLarge,
          isLarge && compact ? styles.previewLargeCompact : '',
          isArtifactHistory && isLarge ? styles.previewArtifactHistory : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div
          className={[
            styles.previewImageWrap,
            isArtifactHistory && isLarge ? styles.previewImageWrapHistory : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div
            className={[
              styles.previewImage,
              isArtifactHistory && isLarge ? styles.previewArtifactHistoryImage : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div
              className={[styles.previewMedia, interactivePreviewClass].filter(Boolean).join(' ')}
              {...(canOpenPreview
                ? {
                    role: 'button' as const,
                    tabIndex: 0,
                    onClick: (event: MouseEvent<HTMLDivElement>) => {
                      lastOpenTriggerRef.current = event.currentTarget;
                      openPreview();
                    },
                    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        lastOpenTriggerRef.current = event.currentTarget;
                        openPreview();
                      }
                    },
                  }
                : {})}
            >
              {showGenericLinkCard ? (
                <a
                  href={canOpenPreview ? undefined : rawLink}
                  target={canOpenPreview ? undefined : '_blank'}
                  rel={canOpenPreview ? undefined : 'noopener noreferrer'}
                  className={styles.linkArtifactCard}
                  onClick={canOpenPreview ? (e) => e.preventDefault() : undefined}
                >
                  {faviconSrc ? (
                    <img
                      src={faviconSrc}
                      alt=""
                      width={32}
                      height={32}
                      className={styles.linkArtifactFavicon}
                      loading="lazy"
                    />
                  ) : null}
                  {linkHostname ? (
                    <span className={styles.linkArtifactDomain}>{linkHostname}</span>
                  ) : null}
                  <span className={styles.linkArtifactExternal} aria-hidden>
                    <ExternalLinkGlyph size={16} />
                  </span>
                </a>
              ) : showHistoryPlaceholder ? (
                <div className={styles.historyPreviewPlaceholder}>
                  <Icon name="upload" size={48} />
                </div>
              ) : (
                resolvedPreviewNonLink
              )}
            </div>

            {/* Type tag — direct file uploads only (not iframe embeds). */}
            {showFileTypeTag && (
              <div
                style={{
                  position: 'absolute',
                  top: 10,
                  left: 10,
                  zIndex: 2,
                }}
              >
                <Tag label={tagLabel} variant="neutral" size="sm" />
              </div>
            )}

            {/* Trash button - editable mode only, top-right */}
            {isEditable && onMinimise ? (
              <div
                style={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  zIndex: 3,
                }}
              >
                {removeDisabled && removeDisabledTooltip ? (
                  <Tooltip label={removeDisabledTooltip} position="top">
                    <span className="inline-flex">
                      <button
                        type="button"
                        className={styles.iconBtn}
                        disabled
                        aria-label="Remove artifact"
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </span>
                  </Tooltip>
                ) : (
                  <button
                    type="button"
                    className={styles.iconBtn}
                    disabled={removeDisabled}
                    onClick={() => onMinimise?.()}
                    aria-label="Remove artifact"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </div>
            ) : null}

          </div>
          {historyFileBar}
        </div>
      </div>

      {/* ── File name bar — large default layout (not Artifact History; Figma iframe has no bar). ── */}
      {isLarge && !isArtifactHistory && !isFigmaEmbed && (
        <>
          {onRegenerateDescription !== undefined &&
            showFigmaMeta &&
            figmaFileMeta && (
              <div className={styles.fileBar}>
                <span className={styles.fileName}>
                  {figmaBarPrimaryLabel || '—'}
                </span>
                <span className={styles.lastEdited}>{figmaFileMeta.lastEdited}</span>
              </div>
            )}
          {!(showFigmaMeta && figmaFileMeta) && (
            <div className={styles.fileBar}>
              <span className={styles.fileName}>{fileName}</span>
              {lastEdited && (
                <span className={styles.lastEdited}>{lastEdited}</span>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Details footer ── */}
      {showDetails && isLarge && isEditable && (
        <div
          className={styles.detailsEditable}
          style={{ paddingBottom: 16 }}
        >
          {/* Row: name input + version select */}
          <div className={styles.detailsRow}>
            <input
              ref={nameRef}
              type="text"
              className={[
                styles.nameInput,
                highlightNameError ? styles.nameInputError : '',
              ]
                .filter(Boolean)
                .join(' ')}
              value={artifactName}
              placeholder="Artifact name"
              onChange={e => onArtifactNameChange?.(e.target.value)}
              aria-label="Artifact name"
            />
            <div
              className={[
                styles.iterationSelectWrap,
                highlightIterationError ? styles.iterationSelectWrapError : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <Select
                options={iterationOptions.map((opt) => ({
                  value: opt,
                  label: displayVersionTagLabel(opt),
                }))}
                value={resolveVersionSelectValue(iteration, iterationOptions)}
                onChange={(val) => onIterationChange?.(val)}
                placeholder=""
                size="sm"
              />
            </div>
          </div>

          {/* Description — Textarea, or TextareaAi when AI actions / loading are shown */}
          <div
            className={styles.descriptionField}
            style={{ width: '100%', padding: 0, margin: 0 }}
          >
            {showAiButton || showAiLoadingButton ? (
              <TextareaAi
                ref={descRef}
                showLabel={false}
                size="sm"
                aria-label="Artifact description"
                placeholder={descriptionPlaceholder}
                value={description}
                showAiButton={showAiButton}
                showLoadingButton={showAiLoadingButton}
                aiButtonLabel={aiButtonLabel}
                fieldShellOuterClassName={textareaStyles.shellOuterTight}
                onAiButtonClick={onRegenerateDescription}
                onChange={e => {
                  setIsUserEdited(true);
                  onDescriptionChange?.(e.target.value);
                }}
                onBlur={onDescriptionBlur}
              />
            ) : (
              <Textarea
                ref={descRef}
                showLabel={false}
                size="sm"
                variant="default"
                aria-label="Artifact description"
                placeholder={descriptionPlaceholder}
                value={description}
                state={descriptionAiState === 'error' ? 'error' : 'default'}
                fieldShellOuterClassName={textareaStyles.shellOuterTight}
                onChange={e => {
                  setIsUserEdited(true);
                  onDescriptionChange?.(e.target.value);
                }}
                onBlur={onDescriptionBlur}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Artifact History — recessed footer + divider + review metadata rows ── */}
      {showDetails && isLarge && isArtifactHistory && (
        <div
          className={[
            styles.detailsReadonly,
            styles.detailsReadonlyArtifactHistory,
          ].join(' ')}
        >
          <div className={styles.artifactHistoryHeaderBlock}>
            <div className={styles.readonlyHeader}>
              <span className={styles.readonlyName}>{artifactName}</span>
              {artifactHistoryVersionTag ? (
                <Tag label={artifactHistoryVersionTag} variant="default" size="sm" />
              ) : null}
            </div>
            {description?.trim() ? (
              <p className={styles.readonlyDesc}>{description}</p>
            ) : null}
          </div>
          {artifactHistoryDetails ? (
            <>
              <Divider className={styles.artifactHistoryDivider} />
              <div className={styles.artifactHistoryDetails}>{artifactHistoryDetails}</div>
            </>
          ) : null}
        </div>
      )}

      {/* ── Read-only details footer (View Review) ── */}
      {showDetails && isLarge && isReadonly && !isArtifactHistory && (
        <div className={styles.detailsReadonly}>
          <div className={styles.readonlyHeader}>
            {canOpenPreview ? (
              <button
                type="button"
                className={styles.readonlyNameButton}
                onClick={(event) => {
                  lastOpenTriggerRef.current = event.currentTarget;
                  openPreview();
                }}
              >
                {artifactName}
              </button>
            ) : (
              <span className={styles.readonlyName}>{artifactName}</span>
            )}
            {iteration ? (
              <Tag
                label={displayVersionTagLabel(iteration)}
                variant="default"
                size="sm"
              />
            ) : null}
          </div>
          {description && (
            <p className={styles.readonlyDesc}>{description}</p>
          )}
        </div>
      )}

      {/* ── Small read-only details (thumbnail card) ── */}
      {showDetails && isSmall && isReadonly && (
        <div className={styles.detailsSmall}>
          <div className={styles.readonlyHeader}>
            {canOpenPreview ? (
              <button
                type="button"
                className={styles.readonlyNameButton}
                onClick={(event) => {
                  lastOpenTriggerRef.current = event.currentTarget;
                  openPreview();
                }}
              >
                {artifactName}
              </button>
            ) : (
              <span className={styles.readonlyName}>{artifactName}</span>
            )}
            {iteration ? (
              <Tag
                label={displayVersionTagLabel(iteration)}
                variant="default"
                size="sm"
              />
            ) : null}
          </div>
          {description && (
            <p className={styles.readonlyDesc}>{description}</p>
          )}
        </div>
      )}
    </div>
  );
}
