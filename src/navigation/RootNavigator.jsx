import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useAuth } from "../contexts/AuthContext";
import LoginScreen from "../screens/auth/LoginScreen";

// Student
import ScheduleScreen from "../screens/student/ScheduleScreen";
import ScanQRScreen from "../screens/student/ScanQRScreen";
import HistoryScreen from "../screens/student/HistoryScreen";

// Teacher
import MyClassesScreen from "../screens/auth/teacher/MyClassesScreen";
import AttendanceSessionScreen from "../screens/auth/teacher/AttendanceSessionScreen";
import ManualAttendanceScreen from "../screens/auth/teacher/ManualAttendanceScreen";

// Admin
import AdminTabs from "../screens/auth/admin/AdminTabs";
import EditUserScreen from "../screens/auth/admin/EditUserScreen"; // <-- Import màn hình

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function StudentTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: "#09090b" },
        headerTintColor: "#fff",
        tabBarStyle: { backgroundColor: "#0a0a0a", borderTopColor: "#18181b" },
        tabBarActiveTintColor: "#a78bfa",
        tabBarInactiveTintColor: "#9ca3af",
      }}
    >
      <Tab.Screen
        name="Schedule"
        component={ScheduleScreen}
        options={{ title: "Lịch học" }}
      />
      <Tab.Screen
        name="ScanQR"
        component={ScanQRScreen}
        options={{ title: "Quét QR" }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{ title: "Lịch sử" }}
      />
    </Tab.Navigator>
  );
}

function TeacherTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: "#09090b" },
        headerTintColor: "#fff",
        tabBarStyle: { backgroundColor: "#0a0a0a", borderTopColor: "#18181b" },
        tabBarActiveTintColor: "#a78bfa",
        tabBarInactiveTintColor: "#9ca3af",
      }}
    >
      <Tab.Screen
        name="MyClasses"
        component={MyClassesScreen}
        options={{ title: "Lớp của tôi" }}
      />
      <Tab.Screen
        name="AttendanceSession"
        component={AttendanceSessionScreen}
        options={{ title: "Phiên điểm danh" }}
      />
      <Tab.Screen
        name="ManualAttendance"
        component={ManualAttendanceScreen}
        options={{ title: "Thủ công" }}
      />
    </Tab.Navigator>
  );
}

// KHÔNG CẦN AdminNavigator riêng nữa

export default function RootNavigator() {
  const { user, role } = useAuth();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: "#09090b" },
        headerTintColor: "#fff",
        contentStyle: { backgroundColor: "#09090b" },
      }}
    >
      {!user ? (
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
      ) : role === "sinhvien" ? (
        <Stack.Screen
          name="StudentHome"
          component={StudentTabs}
          options={{ headerShown: false }}
        />
      ) : role === "giangvien" ? (
        <Stack.Screen
          name="TeacherHome"
          component={TeacherTabs}
          options={{ headerShown: false }}
        />
      ) : role === "quantri" ? (
        // THAY ĐỔI: Đăng ký các màn hình admin trực tiếp tại đây
        <>
          <Stack.Screen
            name="AdminRoot"
            component={AdminTabs}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="EditUser"
            component={EditUserScreen}
            options={{ title: "Chỉnh sửa người dùng" }}
          />
        </>
      ) : (
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
      )}
    </Stack.Navigator>
  );
}
