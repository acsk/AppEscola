import React from "react";
import { View, Text, TextInput, TextInputProps } from "react-native";

type Props = TextInputProps & {
  label: string;
  error?: string;
  required?: boolean;
};

export default function FormInput({ label, error, required, ...props }: Props) {
  return (
    <View className="mb-4">
      <Text className="text-sm font-semibold text-gray-700 mb-1.5">
        {label}
        {required && <Text className="text-red-500"> *</Text>}
      </Text>
      <TextInput
        className={`border rounded-xl px-4 py-2.5 text-sm text-gray-800 bg-gray-50 ${
          error ? "border-red-400" : "border-gray-200"
        }`}
        placeholderTextColor="#9CA3AF"
        {...props}
      />
      {error && (
        <Text className="text-xs text-red-500 mt-1">{error}</Text>
      )}
    </View>
  );
}
