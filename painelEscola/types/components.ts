import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

export type IoniconName = ComponentProps<typeof Ionicons>["name"];

export type NavItem = {
  id: string;
  label: string;
  icon: IoniconName;
  hasSubmenu?: boolean;
};

export type SidebarProps = {
  activeItem?: string;
  onSelectItem?: (id: string) => void;
  canManageTenants?: boolean;
  canManageUsers?: boolean;
  isMobile?: boolean;
  onClose?: () => void;
  apiVersion?: string;
};

export type ConfirmModalProps = {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  confirmDisabled?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  iconName?: IoniconName;
  tone?: "danger" | "primary";
};

export type MessageModalType = "success" | "error" | "info" | "warning";

export type MessageModalProps = {
  visible: boolean;
  type: MessageModalType;
  title: string;
  message: string;
  onClose: () => void;
};
