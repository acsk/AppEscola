import { useWindowDimensions } from "react-native";

export function useResponsiveLayout() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  return {
    width,
    isMobile,
    contentPadding: isMobile ? 16 : 24,
    tableMinWidth: isMobile ? 760 : undefined,
  };
}
