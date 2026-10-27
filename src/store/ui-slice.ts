import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { defaultLocale, type Locale } from "@/i18n/config";

export interface UiState {
  locale: Locale;
}

const initialState: UiState = { locale: defaultLocale };

export const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setLocale(state, action: PayloadAction<Locale>) {
      state.locale = action.payload;
    },
  },
});

export const { setLocale } = uiSlice.actions;
