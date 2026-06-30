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

  dragFirstHandleBy(dx: number): Promise<void> {
    return cy
      .get(HANDLE)
      .first()
      .then(($el) => {
        const rect = $el[0].getBoundingClientRect();
        const cx = rect.x + rect.width / 2;
        const cyPos = rect.y + rect.height / 2;

        return cy
          .wrap($el)
          .trigger("pointerdown", { clientX: cx, clientY: cyPos, pointerId: 1 })
          .trigger("pointermove", {
            clientX: cx + dx,
            clientY: cyPos,
            pointerId: 1,
          })
          .trigger("pointerup", {
            clientX: cx + dx,
            clientY: cyPos,
            pointerId: 1,
          });
      }) as unknown as Promise<void>;
  }
}
