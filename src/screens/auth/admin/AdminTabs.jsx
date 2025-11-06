import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import Ionicons from "@expo/vector-icons/Ionicons";
import DashboardScreen from "./DashboardScreen";
import UsersScreen from "./UsersScreen";
import CreateUserScreen from "./CreateUserScreen";
import ClassesScreen from "./ClassesScreen";
import SessionsScreen from "./SessionsScreen";
import SubjectsScreen from "./SubjectsScreen"; // <-- IMPORT MÀN HÌNH MỚI

const Tab = createBottomTabNavigator();

export default function AdminTabs() {
  const iconMap = {
    Dashboard: "speedometer-outline",
    Users: "people-outline",
    CreateUser: "person-add-outline",
    Subjects: "book-outline",
    Classes: "school-outline",
    Sessions: "calendar-outline",
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: "#09090b" },
        headerTintColor: "#fff",
        tabBarStyle: { backgroundColor: "#0a0a0a", borderTopColor: "#18181b" },
        tabBarActiveTintColor: "#a78bfa",
        tabBarInactiveTintColor: "#9ca3af",
        tabBarIcon: ({ color, size }) => (
          <Ionicons
            name={iconMap[route.name] ?? "ellipse-outline"}
            size={size}
            color={color}
          />
        ),
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: "Tổng quan" }}
      />
      <Tab.Screen
        name="Users"
        component={UsersScreen}
        options={{ title: "Người dùng" }}
      />
      <Tab.Screen
        name="CreateUser"
        component={CreateUserScreen}
        options={{ title: "Tạo tài khoản" }}
      />

      {/* THÊM TAB MÔN HỌC MỚI */}
      <Tab.Screen
        name="Subjects"
        component={SubjectsScreen}
        options={{ title: "Môn học" }}
      />

      <Tab.Screen
        name="Classes"
        component={ClassesScreen}
        options={{ title: "Lớp học" }}
      />
      <Tab.Screen
        name="Sessions"
        component={SessionsScreen}
        options={{ title: "Buổi học" }}
      />
    </Tab.Navigator>
  );
}
