import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { api } from "./api";
import { apiErrorMiddleware } from "./error-middleware";
import { uiSlice } from "./ui-slice";

const rootReducer = combineReducers({
  [uiSlice.name]: uiSlice.reducer,
  [api.reducerPath]: api.reducer,
});

export type RootState = ReturnType<typeof rootReducer>;

// A new store per request on the server, one per tab in the browser.
export function makeStore(preloadedState?: Partial<RootState>) {
  return configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefault) =>
      getDefault().concat(api.middleware, apiErrorMiddleware),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore["dispatch"];
