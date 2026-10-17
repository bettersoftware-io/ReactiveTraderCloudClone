import { describe, expect, it } from "vitest";

import {
  CODE_INPUT_ERROR,
  DISPLAY_NAME_INPUT_ERROR,
  EMAIL_INPUT_ERROR,
} from "#/presenters/accountAccessCopy";
import {
  checkCodeInput,
  checkDisplayNameInput,
  checkEmailInput,
  checkPasswordInput,
  type InputCheck,
} from "#/presenters/accountAccessFold";
import {
  type AccountField,
  describeFieldError,
  findFirstFailingField,
} from "#/presenters/accountFieldFeedback";

/** Each field's check with one failing and one passing value, and the
 * error the failing one shows. */
const FIELDS: readonly (readonly [
  AccountField,
  (raw: string) => InputCheck,
  string,
  string,
  string,
])[] = [
  ["email", checkEmailInput, "nope", "a@b.co", EMAIL_INPUT_ERROR],
  ["display-name", checkDisplayNameInput, "", "Ada", DISPLAY_NAME_INPUT_ERROR],
  ["code", checkCodeInput, "1", "12345678", CODE_INPUT_ERROR],
  [
    "password",
    checkPasswordInput,
    "Short1!",
    "Abcdefgh123!",
    "Password: at least 12 characters",
  ],
];

describe("field feedback", () => {
  describe.each(FIELDS)("%s", (_field, check, failing, passing, error) => {
    it("shows nothing for a failing value before the field is revealed", () => {
      expect(describeFieldError(check(failing), false)).toBeNull();
    });

    it("shows the check's own error for a failing value once revealed", () => {
      expect(describeFieldError(check(failing), true)).toBe(error);
    });

    it("shows nothing for a passing value, revealed or not", () => {
      expect(describeFieldError(check(passing), true)).toBeNull();
      expect(describeFieldError(check(passing), false)).toBeNull();
    });
  });

  it("names the first failing field in form order", () => {
    expect(
      findFirstFailingField([
        ["email", checkEmailInput("a@b.co")],
        ["display-name", checkDisplayNameInput("")],
        ["code", checkCodeInput("12")],
      ]),
    ).toBe("display-name");
  });

  it("names none when every field passes", () => {
    expect(
      findFirstFailingField([["code", checkCodeInput("12345678")]]),
    ).toBeNull();
  });

  it("names none for a form with no checked fields", () => {
    expect(findFirstFailingField([])).toBeNull();
  });
});
