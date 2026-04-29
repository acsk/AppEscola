import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import StatCard from "../components/StatCard";
import DonutChart from "../components/DonutChart";
import AttendanceChart from "../components/AttendanceChart";
import CalendarWidget from "../components/CalendarWidget";

const attendanceData = [
  { day: "Seg", present: 70, absent: 30 },
  { day: "Ter", present: 65, absent: 35 },
  { day: "Qua", present: 95, absent: 40 },
  { day: "Qui", present: 80, absent: 45 },
  { day: "Sex", present: 75, absent: 55 },
];

const agendaItems = [
  {
    id: "1",
    time: "07:30",
    title: "Revisão de Redação",
    subtitle: "Todas as turmas",
    color: "#EDE9FE",
    borderColor: "#7C3AED",
    bold: false,
  },
  {
    id: "2",
    time: "09:00",
    title: "Simulado — Matemática",
    subtitle: "3º Ano — Turma A",
    color: "#FEF3C7",
    borderColor: "#F59E0B",
    bold: true,
  },
  {
    id: "3",
    time: "10:30",
    title: "Aula de Ciências",
    subtitle: "2º Ano — Turma B",
    color: "#ECFDF5",
    borderColor: "#10B981",
    bold: false,
  },
];

const messages = [
  {
    id: "1",
    name: "Profa. Ana Lima",
    time: "08:15",
    text: "O simulado de hoje está confirmado para as 9h.",
    initials: "AL",
    color: "#EDE9FE",
    textColor: "#7C3AED",
  },
  {
    id: "2",
    name: "Rafael (Aluno)",
    time: "09:02",
    text: "Não consegui acessar o material de revisão.",
    initials: "RA",
    color: "#FEF3C7",
    textColor: "#B45309",
  },
  {
    id: "3",
    name: "Coordenação",
    time: "10:45",
    text: "Reunião pedagógica amanhã às 18h.",
    initials: "CO",
    color: "#ECFDF5",
    textColor: "#065F46",
  },
];

export default function DashboardScreen() {
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Page Title */}
      <View className="mb-6">
        <Text className="text-2xl font-bold text-gray-800">Dashboard</Text>
        <Text className="text-sm text-gray-500 mt-0.5">
          Bem-vindo de volta, Carlos 👋
        </Text>
      </View>

      {/* Stat Cards */}
      <View className="flex-row mb-6 -mx-1.5">
        <StatCard
          title="Alunos"
          value="1.248"
          percentage={15}
          variant="purple"
        />
        <StatCard
          title="Professores"
          value="42"
          percentage={-3}
          variant="amber"
        />
        <StatCard
          title="Turmas"
          value="18"
          percentage={-3}
          variant="sky"
        />
        <StatCard
          title="Aprovações"
          value="320"
          percentage={5}
          variant="teal"
        />
      </View>

      {/* Main Two-column Content */}
      <View className="flex-row gap-5">
        {/* LEFT COLUMN */}
        <View style={{ flex: 2 }}>
          {/* Students Card */}
          <View
            className="bg-white rounded-2xl p-5 mb-5"
            style={{
              shadowColor: "#000",
              shadowOpacity: 0.06,
              shadowRadius: 10,
              elevation: 3,
            }}
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-base font-bold text-gray-800">
                Alunos
              </Text>
              <TouchableOpacity activeOpacity={0.7}>
                <Ionicons name="ellipsis-horizontal" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <DonutChart
              boysCount={593}
              girlsCount={655}
              boysPercent={47}
              girlsPercent={53}
            />
          </View>

          {/* Attendance Card */}
          <View
            className="bg-white rounded-2xl p-5"
            style={{
              shadowColor: "#000",
              shadowOpacity: 0.06,
              shadowRadius: 10,
              elevation: 3,
            }}
          >
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-base font-bold text-gray-800">
                Frequência
              </Text>
              <View className="flex-row gap-2">
                <TouchableOpacity
                  className="bg-violet-100 px-3 py-1 rounded-full"
                  activeOpacity={0.7}
                >
                  <Text className="text-xs text-violet-700 font-semibold">
                    Semanal
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="bg-gray-50 px-3 py-1 rounded-full border border-gray-200"
                  activeOpacity={0.7}
                >
                  <Text className="text-xs text-gray-500 font-medium">
                    Turma A
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            <AttendanceChart data={attendanceData} highlightDay="Qua" />
          </View>
        </View>

        {/* RIGHT COLUMN */}
        <View style={{ flex: 1.2 }}>
          {/* Calendar */}
          <View
            className="bg-white rounded-2xl p-5 mb-5"
            style={{
              shadowColor: "#000",
              shadowOpacity: 0.06,
              shadowRadius: 10,
              elevation: 3,
            }}
          >
            <CalendarWidget />
          </View>

          {/* Agenda */}
          <View
            className="bg-white rounded-2xl p-5 mb-5"
            style={{
              shadowColor: "#000",
              shadowOpacity: 0.06,
              shadowRadius: 10,
              elevation: 3,
            }}
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-base font-bold text-gray-800">Agenda</Text>
              <TouchableOpacity activeOpacity={0.7}>
                <Ionicons name="ellipsis-horizontal" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            {agendaItems.map((item) => (
              <View
                key={item.id}
                className="flex-row mb-3"
                style={{
                  backgroundColor: item.color,
                  borderLeftWidth: 3,
                  borderLeftColor: item.borderColor,
                  borderRadius: 8,
                  padding: 10,
                }}
              >
                <View className="mr-3">
                  <Text className="text-xs font-semibold text-gray-500">
                    {item.time}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-xs text-gray-500">{item.subtitle}</Text>
                  <Text
                    className={`text-sm text-gray-800 mt-0.5 ${
                      item.bold ? "font-bold" : "font-medium"
                    }`}
                  >
                    {item.title}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Messages */}
          <View
            className="bg-white rounded-2xl p-5"
            style={{
              shadowColor: "#000",
              shadowOpacity: 0.06,
              shadowRadius: 10,
              elevation: 3,
            }}
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-base font-bold text-gray-800">
                Mensagens
              </Text>
              <TouchableOpacity activeOpacity={0.7}>
                <Text className="text-xs text-violet-600 font-semibold">
                  Ver tudo
                </Text>
              </TouchableOpacity>
            </View>

            {messages.map((msg) => (
              <View key={msg.id} className="flex-row items-start mb-3">
                <View
                  className="w-9 h-9 rounded-full items-center justify-center mr-3 flex-shrink-0"
                  style={{ backgroundColor: msg.color }}
                >
                  <Text
                    className="text-xs font-bold"
                    style={{ color: msg.textColor }}
                  >
                    {msg.initials}
                  </Text>
                </View>
                <View className="flex-1">
                  <View className="flex-row justify-between items-center">
                    <Text className="text-sm font-semibold text-gray-800">
                      {msg.name}
                    </Text>
                    <Text className="text-xs text-gray-400">{msg.time}</Text>
                  </View>
                  <Text
                    className="text-xs text-gray-500 mt-0.5"
                    numberOfLines={2}
                  >
                    {msg.text}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
