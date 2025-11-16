import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "../contexts/AuthContext";
import LoginScreen from "../screens/auth/LoginScreen";

// Student
import ScheduleScreen from "../screens/student/ScheduleScreen";
import ScanQRScreen from "../screens/student/ScanQRScreen";
import HistoryScreen from "../screens/student/HistoryScreen";

// Teacher
import MyClassesScreen from "../screens/auth/teacher/MyClassesScreen";
import AttendanceSessionScreen from "../screens/auth/teacher/AttendanceSessionScreen";
import AttendanceSessionListScreen from "../screens/auth/teacher/AttendanceSessionTabs";
import ManualAttendanceScreen from "../screens/auth/teacher/ManualAttendanceScreen";

// Admin
import AdminTabs from "../screens/auth/admin/AdminTabs";
import EditUserScreen from "../screens/auth/admin/EditUserScreen";

// Profile
import ProfileScreen from "../screens/common/ProfileScreen";
import ProfileAvatarButton from "../components/ProfileAvatarButton";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function StudentTabs() {
  const iconMap = {
    Schedule: "calendar-outline",
    ScanQR: "qr-code-outline",
    History: "time-outline",
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
        // Avatar tròn góc phải
        headerRight: () => <ProfileAvatarButton />,
      })}
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
  const iconMap = {
    MyClasses: "school-outline",
    AttendanceSession: "qr-code-outline",
    AttendanceList: "list-outline",
    ManualAttendance: "clipboard-outline",
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
        headerRight: () => <ProfileAvatarButton />,
      })}
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
        name="AttendanceList"
        component={AttendanceSessionListScreen}
        options={{ title: "Danh sách" }}
      />
      <Tab.Screen
        name="ManualAttendance"
        component={ManualAttendanceScreen}
        options={{ title: "Thủ công" }}
      />
    </Tab.Navigator>
  );
}

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
        <>
          <Stack.Screen
            name="StudentHome"
            component={StudentTabs}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Profile"
            component={ProfileScreen}
            options={{ title: "Trang cá nhân" }}
          />
        </>
      ) : role === "giangvien" ? (
        <>
          <Stack.Screen
            name="TeacherHome"
            component={TeacherTabs}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Profile"
            component={ProfileScreen}
            options={{ title: "Trang cá nhân" }}
          />
        </>
      ) : role === "quantri" ? (
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
          <Stack.Screen
            name="Profile"
            component={ProfileScreen}
            options={{ title: "Trang cá nhân" }}
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
