import { createNavigationContainerRef } from '@react-navigation/native';
import type { AlunoStackParamList } from './stacks/AlunoStack';

/** Ref global para navegação fora da árvore de telas (ex.: AlunoDrawer). */
export const navigationRef = createNavigationContainerRef<AlunoStackParamList>();
