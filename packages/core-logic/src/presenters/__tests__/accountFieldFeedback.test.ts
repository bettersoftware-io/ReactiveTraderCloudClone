import { describe, expect, it } from "vitest";

import {
  CODE_INPUT_ERROR,
  EMAIL_INPUT_ERROR,
} from "#/presenters/accountAccessCopy";
import {
  checkCodeInput,
  checkDisplayNameInput,
  checkEmailInput,
} from "#/presenters/accountAccessFold";
import {
  describeFieldError,
  findFirstFailingField,
} from "#/presenters/accountFieldFeedback";

describe("field feedback", () => {
  it("shows nothing before the field is revealed", () => {
    expect(describeFieldError(checkEmailInput("nope"), false)).toBeNull();
  });

  it("shows the check's error once revealed", () => {
    expect(describeFieldError(checkEmailInput("nope"), true)).toBe(
      EMAIL_INPUT_ERROR,
    );
  });

  it("shows nothing for a value that passes", () => {
    expect(describeFieldError(checkEmailInput("a@b.co"), true)).toBeNull();
  });

  it("shows the code check's own error for a short code", () => {
    expect(describeFieldError(checkCodeInput("1"), true)).toBe(
      CODE_INPUT_ERROR,
    );
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
});
