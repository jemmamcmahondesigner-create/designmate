'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Button, Checkbox, Icon, Tooltip } from '@/components/ui/ds';
import { getAvatarInlineStyle, avatarColourKey } from '@/lib/utils/avatarColour';
import type { ReviewerPickerOption } from './useWorkspaceReviewerPickerOptions';

export type AddReviewerDropdownProps = {
  workspaceId: string | null;
  assignableContributors: ReviewerPickerOption[];
  disabled?: boolean;
  disabledTooltip?: string;
  saving?: boolean;
  showHelperText?: boolean;
  helperText?: string;
  onAddReviewers: (input: {
    reviewerIds: string[];
    onStartSaving: () => void;
    onFinishSaving: () => void;
    onSuccess: () => void;
  }) => void;
  onOpenCreateTeammateModal: () => void;
};

export function AddReviewerDropdown({
  workspaceId,
  assignableContributors,
  disabled = false,
  disabledTooltip,
  saving = false,
  showHelperText = false,
  helperText,
  onAddReviewers,
  onOpenCreateTeammateModal,
}: AddReviewerDropdownProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedReviewerIds, setSelectedReviewerIds] = useState<string[]>([]);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (menuPanelRef.current?.contains(e.target as Node)) return;
      if (anchorRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      setSearch('');
    }
  }, [menuOpen]);

  const filteredContributors = useMemo(
    () =>
      assignableContributors.filter(
        (contributor) =>
          search.trim() === '' ||
          contributor.name.toLowerCase().includes(search.toLowerCase()) ||
          (contributor.email ?? '').toLowerCase().includes(search.toLowerCase()),
      ),
    [assignableContributors, search],
  );

  const addButton = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      icon="leading"
      iconName="plus"
      label="Add reviewers"
      aria-expanded={menuOpen}
      aria-haspopup="menu"
      disabled={disabled || !workspaceId}
      onClick={() => setMenuOpen((prev) => !prev)}
    />
  );

  return (
    <div className="relative w-full" ref={anchorRef}>
      {disabled && disabledTooltip ? (
        <Tooltip label={disabledTooltip} position="top">
          <span className="inline-flex w-full">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon="leading"
              iconName="plus"
              label="Add reviewers"
              disabled
            />
          </span>
        </Tooltip>
      ) : (
        addButton
      )}

      {menuOpen && workspaceId ? (
        <div
          style={{
            flex: 1,
            minWidth: 0,
            maxWidth: 400,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            position: 'relative',
          }}
        >
          <div
            ref={menuPanelRef}
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              width: 399,
              backgroundColor: '#ffffff',
              border: '1px solid #e4ddd3',
              borderRadius: 8,
              boxShadow:
                '0px 2px 4px rgba(41,33,28,0.06), 0px 8px 16px rgba(41,33,28,0.15)',
              overflow: 'hidden',
              zIndex: 50,
              paddingTop: 4,
              paddingBottom: 0,
              marginBottom: 4,
            }}
          >
            <div
              style={{
                maxHeight: 280,
                overflowY: 'auto',
                overflowX: 'hidden',
                paddingBottom: 4,
              }}
            >
              {filteredContributors.length === 0 ? (
                <div style={{ padding: '8px 12px', fontSize: 13, color: '#998c82' }}>
                  No teammates found.
                </div>
              ) : (
                filteredContributors.map((contributor) => (
                  <label
                    key={contributor.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      cursor: 'pointer',
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  >
                    <Checkbox
                      id={`reviewer-${contributor.id}`}
                      label=""
                      checked={selectedReviewerIds.includes(contributor.id)}
                      onChange={(checked) => {
                        setSelectedReviewerIds((prev) =>
                          checked
                            ? [...prev, contributor.id]
                            : prev.filter((id) => id !== contributor.id),
                        );
                      }}
                    />
                    <Avatar
                      name={contributor.name}
                      contributorId={contributor.id}
                      size="md"
                      style={getAvatarInlineStyle(
                        avatarColourKey(contributor.email, contributor.id),
                        { ring: true },
                      )}
                    />
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: '#2e1c1c',
                        flex: 1,
                      }}
                    >
                      {contributor.name}
                      {contributor.isPending ? (
                        <span
                          style={{
                            marginLeft: 6,
                            fontWeight: 400,
                            color: '#998c82',
                          }}
                        >
                          pending
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))
              )}
            </div>

            <div style={{ height: 1, backgroundColor: '#e4ddd3' }} />

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
              }}
            >
              <Button
                variant="primary"
                size="sm"
                label={saving ? 'Saving' : 'Done'}
                disabled={saving || selectedReviewerIds.length === 0}
                onClick={() => {
                  if (saving || selectedReviewerIds.length === 0) return;
                  onAddReviewers({
                    reviewerIds: selectedReviewerIds,
                    onStartSaving: () => undefined,
                    onFinishSaving: () => undefined,
                    onSuccess: () => {
                      setSelectedReviewerIds([]);
                      setMenuOpen(false);
                      setSearch('');
                    },
                  });
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenCreateTeammateModal();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#6b1e2e',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                <Icon name="plus" size={16} />
                Create a new teammate
              </button>
            </div>
          </div>

          <input
            type="text"
            placeholder="Find teammates"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            style={{
              height: 32,
              width: '100%',
              border: '1px solid #6b1e2e',
              borderRadius: 6,
              padding: '0 8px',
              fontSize: 13,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              color: '#2e1c1c',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />

          {showHelperText && helperText ? (
            <p style={{ fontSize: 12, color: '#6b5e55', margin: 0 }}>{helperText}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
