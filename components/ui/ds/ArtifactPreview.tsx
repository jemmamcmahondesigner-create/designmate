'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Divider } from './Divider';
import { Icon } from './Icon';
import { Select } from './Select';
import { Tag } from './Tag';
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
  try {
    const embedUrl = new URL(url);
    embedUrl.hostname = 'embed.figma.com';
    if (embedUrl.pathname.startsWith('/file/')) {
      embedUrl.pathname = embedUrl.pathname.replace('/file/', '/design/');
    }
    embedUrl.searchParams.set('embed-host', 'designmate');
    return embedUrl.toString();
  } catch {
    return url;
  }
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

function renderPreviewContent(
  imageUrl?: string,
  linkUrl?: string,
  fileType?: ArtifactPreviewFileType
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

  if (linkUrl && isFigmaUrl(linkUrl)) {
    const embedUrl = buildFigmaEmbedUrl(linkUrl);
    return (
      <iframe
        src={embedUrl}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
        }}
        allowFullScreen
        title="Figma preview"
        loading="lazy"
      />
    );
  }

  if (imageUrl && ft === 'pdf') {
    return (
      <iframe
        src={imageUrl}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
        }}
        title="PDF preview"
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
  /** Minimise / remove artifact (editable mode trash control) */
  onMinimise?: () => void;
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
  onMinimise,
  highlightNameError = false,
  highlightIterationError = false,
  descriptionAiState = 'idle',
  canGenerateAiDescription = false,
  onRegenerateDescription,
  persistedAiGenerated = false,
  className,
}: ArtifactPreviewProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const [zoom, setZoom] = useState(1);

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

  const isZoomableImage = Boolean(
    imageUrl &&
      fileType &&
      ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(fileType)
  );

  const showZoomControls = isZoomableImage;

  /** Non-upload link artifact (no image blob): compact favicon card instead of empty gray preview. */
  const rawLink = String(linkUrl ?? '').trim();
  const showGenericLinkCard =
    Boolean(rawLink) &&
    !imageUrl &&
    !isFigmaUrl(rawLink);
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
    : renderPreviewContent(imageUrl, linkUrl, fileType);
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

  /** Uploaded file artifacts only — hide for link_url–only rows (Figma, generic links, etc.). */
  const hasArtifactFilePreviewSource = Boolean(String(imageUrl ?? '').trim());
  const showArtifactHistoryFileBar =
    isArtifactHistory &&
    isLarge &&
    !(Boolean(rawLink) && !hasArtifactFilePreviewSource);

  const showAiLoadingButton = descriptionAiState === 'loading';
  const descTrim = description.trim();
  const showAiButton =
    Boolean(onRegenerateDescription) && !showAiLoadingButton;

  const aiButtonLabel = !descTrim
    ? 'Generate with Ai'
    : 'Regenerate with Ai';

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

  return (
    <div className={rootClass}>
      {/* ── Preview area ── */}
      <div
        className={[
          styles.preview,
          isSmall ? styles.previewSmall : styles.previewLarge,
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
            {/* Actual preview content - fills the area */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  transform: isZoomableImage ? `scale(${zoom})` : undefined,
                  transformOrigin: 'center center',
                  transition: isZoomableImage ? 'transform 150ms ease' : undefined,
                }}
              >
                {showGenericLinkCard ? (
                  <a
                    href={rawLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.linkArtifactCard}
                  >
                    {/* TODO: Replace favicon fallback with real thumbnail preview once preview API is integrated */}
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
            </div>

            {/* Type tag - top left (hidden for Figma iframe embeds; always for Artifact History) */}
            {(!isFigmaEmbed || isArtifactHistory) && (
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
            {isEditable && (
              <div
                style={{
                  position: 'absolute',
                  top: 10,
                  ...(showGenericLinkCard ? { left: 10, right: 'auto' } : { right: 10 }),
                  zIndex: 3,
                }}
              >
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => onMinimise?.()}
                  aria-label="Remove artifact"
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            )}

            {/* Zoom controls - any mode when preview is a zoomable image,
                bottom-right so they don't clash with the trash button */}
            {showZoomControls && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 10,
                  right: 10,
                  zIndex: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => setZoom(z => Math.min(z + 0.25, 3))}
                  aria-label="Zoom in"
                >
                  <Icon name="plus" size={14} />
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => setZoom(z => Math.max(z - 0.25, 1))}
                  disabled={zoom <= 1}
                  aria-label="Zoom out"
                >
                  <span className={styles.minusIcon} aria-hidden="true" />
                </button>
              </div>
            )}
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
                options={iterationOptions.map(opt => ({ value: opt, label: opt }))}
                value={iteration || undefined}
                onChange={val => onIterationChange?.(val)}
                placeholder="Version"
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
                onChange={e => onDescriptionChange?.(e.target.value)}
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
                onChange={e => onDescriptionChange?.(e.target.value)}
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
            <span className={styles.readonlyName}>{artifactName}</span>
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
      {showDetails && isSmall && (
        <div className={styles.detailsSmall}>
          <div className={styles.readonlyHeader}>
            <span className={styles.readonlyName}>{artifactName}</span>
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
