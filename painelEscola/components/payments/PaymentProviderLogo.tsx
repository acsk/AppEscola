import React, { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { resolvePaymentProviderLogoUrl } from "../../utils/paymentProviderLogo";

type PaymentProviderLogoProps = {
  uri?: string | null;
  size?: number;
  rounded?: number;
};

export default function PaymentProviderLogo({
  uri,
  size = 72,
  rounded = 18,
}: PaymentProviderLogoProps) {
  const [hasError, setHasError] = useState(false);
  const resolvedUri = resolvePaymentProviderLogoUrl(uri);

  useEffect(() => {
    setHasError(false);
  }, [resolvedUri]);

  return (
    <View
      className="items-center justify-center overflow-hidden border border-gray-100 bg-white"
      style={{
        width: size,
        height: size,
        borderRadius: rounded,
      }}
    >
      {!!resolvedUri && !hasError ? (
        <Image
          source={{ uri: resolvedUri }}
          style={{ width: size - 14, height: size - 14 }}
          resizeMode="contain"
          onError={() => setHasError(true)}
        />
      ) : (
        <View className="items-center justify-center px-2">
          <Ionicons name="business-outline" size={size > 56 ? 24 : 18} color="#7C3AED" />
        </View>
      )}
    </View>
  );
}
