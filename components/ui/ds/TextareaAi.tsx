'use client';

import { forwardRef, useId } from 'react';
import { Button } from './Button';
import { Icon } from './Icon';
import { IconSquareButton } from './IconSquareButton';
import { Textarea, type TextareaProps } from './Textarea';
import { Tooltip } from './Tooltip';
import styles from './TextareaAi.module.css';

export interface TextareaAiProps extends TextareaProps {
  /**
   * When true, omits the footer row (helper + AI actions) while idle — no
   * loading button, no AI button, and no helper text. Use when actions live
   * outside the component (e.g. Add Link modal helper row).
   */
  hideIdleAiFooter?: boolean;
  showAiButton?: boolean;
  showLoadingButton?: boolean;
  onAiButtonClick?: () => void;
  /**
   * When set, the AI button renders as a full-width secondary button with a
   * leading star icon and this label (e.g. "Generate with Ai"). When omitted,
   * the AI button falls back to the icon-only square button.
   */
  aiButtonLabel?: string;
  /** Tooltip for the labelled AI button (e.g. when label is "Optimise with Ai"). */
  aiButtonTooltip?: string;
  /** Disables the labelled AI button (e.g. missing prerequisites); pair with `aiButtonTooltip` for context. */
  aiButtonDisabled?: boolean;
  /**
   * When true, pulses the textarea placeholder only (field stays interactive).
   * Use with showLoadingButton for the spinner in the footer.
   */
  generating?: boolean;
}

export const TextareaAi = forwardRef<HTMLTextAreaElement, TextareaAiProps>(
  function TextareaAi(
    {
      hideIdleAiFooter = false,
      showAiButton = false,
      showLoadingButton = false,
      onAiButtonClick,
      aiButtonLabel,
      aiButtonTooltip,
      aiButtonDisabled = false,
      generating = false,
      className,
      showHelper = false,
      helperText,
      'aria-describedby': ariaDescribedByUser,
      ...textareaProps
    },
    ref,
  ) {
    const footerHelperId = useId();
    const wrapClass = [
      styles.outer,
      generating ? styles.generatingPulse : '',
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ');
    const showRegenerateButton = showAiButton && !showLoadingButton;
    const showFooterHelper = Boolean(showHelper && helperText);
    const showAiFooterRow = !(
      hideIdleAiFooter &&
      !showLoadingButton &&
      !showAiButton &&
      !showFooterHelper
    );
    const mergedDescribedBy =
      [ariaDescribedByUser?.trim() || null, showFooterHelper ? footerHelperId : null]
        .filter(Boolean)
        .join(' ') || undefined;

    return (
      <div className={wrapClass}>
        <Textarea
          ref={ref}
          {...textareaProps}
          showHelper={false}
          helperText={undefined}
          aria-describedby={mergedDescribedBy}
        />

        {showAiFooterRow ? (
          <div className={styles.aiFooter}>
            <div className={styles.aiFooterStart}>
              {showFooterHelper ? (
                <p id={footerHelperId} className={styles.footerHelper}>
                  {helperText}
                </p>
              ) : null}
            </div>
            <div className={styles.aiFooterActions}>
              {showLoadingButton ? (
                aiButtonLabel ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    label={aiButtonLabel}
                    icon="leading"
                    iconName="loading"
                    disabled
                    className={styles.loadingAiButton}
                    aria-label={aiButtonLabel}
                  />
                ) : (
                  <button
                    type="button"
                    className={styles.loadingBtn}
                    disabled
                    aria-busy
                    aria-label="Generating description"
                    tabIndex={-1}
                  >
                    <Icon
                      name="loading"
                      size={14}
                      className={styles.loadingBtnSpin}
                      aria-hidden
                    />
                  </button>
                )
              ) : showRegenerateButton ? (
                aiButtonLabel ? (
                  aiButtonTooltip ? (
                    <Tooltip label={aiButtonTooltip} position="top">
                      <span style={{ display: 'inline-flex' }}>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          label={aiButtonLabel}
                          icon="leading"
                          iconName="ai-stars"
                          disabled={aiButtonDisabled}
                          onClick={onAiButtonClick}
                        />
                      </span>
                    </Tooltip>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      label={aiButtonLabel}
                      icon="leading"
                      iconName="ai-stars"
                      disabled={aiButtonDisabled}
                      onClick={onAiButtonClick}
                    />
                  )
                ) : (
                  <Tooltip
                    label={aiButtonTooltip ?? 'Regenerate description'}
                    position="top"
                  >
                    <IconSquareButton
                      icon="ai-stars"
                      label="Regenerate description"
                      iconSize={14}
                      onClick={onAiButtonClick}
                    />
                  </Tooltip>
                )
              ) : (
                <span className={styles.footerBtnReserve} aria-hidden />
              )}
            </div>
          </div>
        ) : null}
      </div>
    );
  },
);

TextareaAi.displayName = 'TextareaAi';
