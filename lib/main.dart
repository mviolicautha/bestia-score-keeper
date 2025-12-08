import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
// Assicurati che questi import corrispondano al nome nel tuo pubspec.yaml
import 'package:bestia_scoreboard_application/logic/game_provider.dart';
import 'package:bestia_scoreboard_application/ui/screens/game_table_screen.dart';

void main() {
  // Assicura che i binding di Flutter siano inizializzati prima di usare plugin (sqflite)
  WidgetsFlutterBinding.ensureInitialized();
  
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => GameProvider()),
      ],
      child: const MyApp(),
    ),
  );
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Bestia Scoreboard',
      theme: ThemeData(
        // Colore primario verde per richiamare il tavolo da gioco
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF35654d)),
        useMaterial3: true,
      ),
      // Qui diciamo all'app di partire dalla TUA schermata del tavolo
      home: const GameTableScreen(),
    );
  }
}
