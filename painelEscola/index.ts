import { registerRootComponent } from 'expo';

import { installTheme } from './constants/themeCss';
import App from './App';

// Tema claro/escuro antes do primeiro render (evita piscar o tema errado).
installTheme();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
