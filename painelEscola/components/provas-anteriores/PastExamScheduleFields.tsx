import React, { useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import DatePickerInput from "../ui/DatePickerInput";
import FormSelect from "../ui/FormSelect";
import {
  buildYearOptions,
  type PastExamScheduleMode,
  type PastExamScheduleValue,
} from "../../utils/pastExamSchedule";

type MaterialKind = "prova" | "exercicio";

type Props = {
  materialKind: MaterialKind;
  value: PastExamScheduleValue;
  onChange: (value: PastExamScheduleValue) => void;
  errors?: { exam_date?: string; exam_year?: string };
};

const MODE_LABELS: Record<PastExamScheduleMode, string> = {
  year: "Somente ano",
  date: "Data completa",
  none: "Não informar",
};

function modeOptions(materialKind: MaterialKind): { value: PastExamScheduleMode; label: string }[] {
  if (materialKind === "prova") {
    return [
      { value: "year", label: MODE_LABELS.year },
      { value: "date", label: MODE_LABELS.date },
    ];
  }
  return [
    { value: "none", label: MODE_LABELS.none },
    { value: "year", label: MODE_LABELS.year },
    { value: "date", label: MODE_LABELS.date },
  ];
}

export default function PastExamScheduleFields({
  materialKind,
  value,
  onChange,
  errors = {},
}: Props) {
  const yearOptions = useMemo(() => buildYearOptions(), []);
  const options = modeOptions(materialKind);
  const scheduleRequired = materialKind === "prova";

  const setMode = (mode: PastExamScheduleMode) => {
    onChange({
      mode,
      exam_year: mode === "year" ? value.exam_year : "",
      exam_date: mode === "date" ? value.exam_date : "",
    });
  };

  return (
    <View className="mb-1">
      <Text className="text-sm font-semibold text-gray-700 mb-1.5">
        {materialKind === "prova" ? "Quando foi a prova" : "Data do exercício"}
        {scheduleRequired ? <Text className="text-red-500"> *</Text> : null}
      </Text>

      <View className="flex-row flex-wrap gap-2 mb-3">
        {options.map((opt) => {
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
        <FormSelect
          label="Ano"
          required={scheduleRequired}
          value={value.exam_year}
          options={[{ value: "", label: "Selecione o ano" }, ...yearOptions]}
          placeholder="Selecione o ano"
          onChange={(exam_year) => onChange({ ...value, exam_year })}
          error={errors.exam_year ?? errors.exam_date}
        />
      ) : null}

      {value.mode === "date" ? (
        <DatePickerInput
          label="Data"
          required={scheduleRequired}
          value={value.exam_date}
          onChangeText={(exam_date) => onChange({ ...value, exam_date })}
          error={errors.exam_date}
        />
      ) : null}

      {value.mode === "none" ? (
        <Text className="text-xs text-gray-400 -mt-2 mb-3">
          Opcional para exercícios sem data definida.
        </Text>
      ) : null}
    </View>
  );
}
