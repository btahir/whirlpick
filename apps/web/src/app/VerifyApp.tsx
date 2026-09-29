// The React root of /verify/: only the verify widget (the rest of the page is static HTML).
import { VerifyWidget } from "../pages/VerifyPage";
import { StoreContext, type Store } from "../state/store";
import { ControllerContext } from "../ui/primitives";
import type { Controller } from "./controller";

export function VerifyApp({ store, controller }: { store: Store; controller: Controller }) {
  return (
    <StoreContext.Provider value={store}>
      <ControllerContext.Provider value={controller}>
        <VerifyWidget />
      </ControllerContext.Provider>
    </StoreContext.Provider>
  );
}
