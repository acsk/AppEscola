import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import DatePickerInput from "../ui/DatePickerInput";
import YearPickerInput from "../ui/YearPickerInput";
import {
  type PastExamScheduleMode,
  type PastExamScheduleValue,
} from "../../utils/pastExamSchedule";

type MaterialKind = "prova" | "exercicio";

type Props = {
  materialKind: MaterialKind;
  value: PastExamScheduleValue;
  onChange: (value: PastExamScheduleValue) => void;
  errors?: { exam_date?: string; exam_year?: string };
  compact?: boolean;
};

const MODE_LABELS: Record<PastExamScheduleMode, string> = {
  year: "Somente ano",
  date: "Data completa",
  none: "Não informar",
};

const EXERCICIO_MODE_OPTIONS: { value: PastExamScheduleMode; label: string }[] = [
  { value: "none", label: MODE_LABELS.none },
  { value: "year", label: MODE_LABELS.year },
  { value: "date", label: MODE_LABELS.date },
];

export default function PastExamScheduleFields({
  materialKind,
  value,
  onChange,
  errors = {},
  compact = false,
}: Props) {
  const setMode = (mode: PastExamScheduleMode) => {
    onChange({
      mode,
      exam_year: mode === "year" ? value.exam_year : "",
      exam_date: mode === "date" ? value.exam_date : "",
    });
  };

  if (materialKind === "prova") {
    return (
      <View className={compact ? "mb-0" : "mb-1"}>
        <YearPickerInput
          label="Ano da prova"
          required
          compact={compact}
          value={value.exam_year}
          onChange={(exam_year) =>
            onChange({ mode: "year", exam_year, exam_date: "" })
          }
          error={errors.exam_year ?? errors.exam_date}
          modalTitle="Ano da prova"
        />
      </View>
    );
  }

  return (
    <View className={compact ? "mb-0" : "mb-1"}>
      <Text
        className={`font-semibold text-gray-700 ${compact ? "text-xs mb-1" : "text-sm mb-1.5"}`}
      >
        Data do exercício
      </Text>

      <View className={`flex-row flex-wrap gap-2 ${compact ? "mb-2" : "mb-3"}`}>
        {EXERCICIO_MODE_OPTIONS.map((opt) => {
          const active = value.mode === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => setMode(opt.value)}
              className={`px-3 py-2 rounded-full border ${
                active
                  ? "bg-violet-600 border-violet-600"
                  : "bg-white border-gray-200"
              }`}
              activeOpacity={0.85}
            >
              <Text
                className={`text-xs font-semibold ${
                  active ? "text-white" : "text-gray-600"
                }`}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {value.mode === "year" ? (
        <YearPickerInput
          label="Ano"
          compact={compact}
          value={value.exam_year}
          onChange={(exam_year) => onChange({ ...value, mode: "year", exam_year })}
          error={errors.exam_year}
          modalTitle="Ano do exercício"
        />
      ) : null}

      {value.mode === "date" ? (
        <DatePickerInput
          label="Data"
          compact={compact}
          value={value.exam_date}
          onChangeText={(exam_date) => onChange({ ...value, mode: "date", exam_date })}
          error={errors.exam_date}
        />
      ) : null}

      {value.mode === "none" ? (
        <Text className="text-xs text-gray-400 mt-1 mb-1">
          Opcional — exercício sem data ou ano definido.
        </Text>
      ) : null}
    </View>
  );
}
