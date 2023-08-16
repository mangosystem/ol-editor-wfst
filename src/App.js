import { ThemeProvider, unstable_createMuiStrictModeTheme } from '@material-ui/core';
import './App.css';
import Main from './components/map/main/Main';

function App() {

	const theme = unstable_createMuiStrictModeTheme();
	
	return (
		<ThemeProvider theme = {theme}>
			<div className="App">
				<Main />
			</div>
		</ThemeProvider>
	);
}

export default App;
