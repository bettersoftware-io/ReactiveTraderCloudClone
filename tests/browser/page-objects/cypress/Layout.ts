import type { LayoutPO } from "../contracts/Layout";
import { TESTIDS } from "../contracts/testids";

const HANDLE = `hr[data-testid^="${TESTIDS.layout.handlePrefix}"]`;

export class CypressLayout implements LayoutPO {
  handleCount(): Promise<number> {
    return cy.get("body").then(($body) => {
      return $body.find(HANDLE).length;
    }) as unknown as Promise<number>;
  }

  firstHandleSize(): Promise<number> {
    return cy
      .get(HANDLE)
      .first()
      .invoke("attr", "aria-valuenow")
      .then((v) => {
        return Number(v);
      }) as unknown as Promise<number>;
  }

  dragFirstHandleBy(delta: number): Promise<void> {
    return cy
      .get(HANDLE)
      .first()
      .then(($el) => {
        const rect = $el[0].getBoundingClientRect();
        const cx = rect.x + rect.width / 2;
        const cyPos = rect.y + rect.height / 2;
        // aria-orientation "vertical" = a row split's handle (resizes along
        // x); "horizontal" = a column split's handle (resizes along y).
        const vertical = $el.attr("aria-orientation") === "vertical";
        const tx = vertical ? cx + delta : cx;
        const ty = vertical ? cyPos : cyPos + delta;

        return cy
          .wrap($el)
          .trigger("pointerdown", { clientX: cx, clientY: cyPos, pointerId: 1 })
          .trigger("pointermove", {
            clientX: tx,
            clientY: ty,
            pointerId: 1,
          })
          .trigger("pointerup", {
            clientX: tx,
            clientY: ty,
            pointerId: 1,
          });
      }) as unknown as Promise<void>;
  }
}
