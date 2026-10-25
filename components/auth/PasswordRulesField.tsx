"use client";

import type { FocusEvent } from "react";
import { Icon, Input } from "@/components/ui/ds";
import {
  PASSWORD_RULES,
  type PasswordRuleId,
} from "@/lib/auth/passwordRules";
import styles from "./PasswordRulesField.module.css";

type RuleState = "neutral" | "met" | "error";

function ruleState(
  met: boolean,
  revealed: boolean,
  forced: boolean,
): RuleState {
  if (forced || (revealed && !met)) return "error";
  if (met) return "met";
  return "neutral";
}

function PasswordRulesList({
  password,
  revealed,
  failedRuleIds,
}: {
  password: string;
  revealed: boolean;
  failedRuleIds: readonly PasswordRuleId[];
}) {
  return (
    <ul className={styles.list}>
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        const state = ruleState(met, revealed, failedRuleIds.includes(rule.id));
        return (
          <li
            key={rule.id}
            className={`${styles.row} ${styles[state]}`}
            data-password-rule={rule.id}
            data-rule-state={state}
          >
            {state === "met" ? (
              <Icon name="check" size={12} />
            ) : state === "error" ? (
              <span className={styles.errorIcon}>
                <Icon name="status-blocked" size={12} />
              </span>
            ) : (
              <span className={styles.spacer} aria-hidden="true" />
            )}
            <span>{rule.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function PasswordRulesField({
  label,
  placeholder,
  name,
  autoComplete,
  value,
  onChange,
  revealed,
  onReveal,
  failedRuleIds = [],
}: {
  label: string;
  placeholder: string;
  name: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  revealed: boolean;
  onReveal: () => void;
  failedRuleIds?: readonly PasswordRuleId[];
}) {
  const unmet = PASSWORD_RULES.some(
    (rule) => failedRuleIds.includes(rule.id) || (revealed && !rule.test(value)),
  );
  const list = (
    <PasswordRulesList
      password={value}
      revealed={revealed}
      failedRuleIds={failedRuleIds}
    />
  );

  return (
    <Input
      label={label}
      type="password"
      size="lg"
      name={name}
      placeholder={placeholder}
      autoComplete={autoComplete}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={(_event: FocusEvent<HTMLInputElement>) => onReveal()}
      error={unmet}
      errorMessage={unmet ? list : undefined}
      helperText={unmet ? undefined : list}
      showHelper={!unmet}
      className="w-full"
    />
  );
}
