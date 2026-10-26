import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewProps } from 'react-native-webview';
import { canNavigate } from './policy';
import type { WebManifest } from './contracts.mjs';

/** No onMessage, injected JS or native SDK is exposed to remote projects. */
export default function WebProject({ app, onClose }: { app: WebManifest; onClose: () => void }) {
  const ref = useRef<WebView<WebViewProps>>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [attempt, setAttempt] = useState(0);
  function close() { Alert.alert('Project sluiten?', 'Bewaar eventuele wijzigingen eerst in het project.', [{ text: 'Blijven', style: 'cancel' }, { text: 'Sluiten', onPress: onClose }]); }
  return <View style={s.fill}>
    <View style={s.bar}>
      <Pressable accessibilityRole="button" onPress={close} style={s.button}><Text style={s.link}>‹ AppHub</Text></Pressable>
      <View style={s.title}><Text numberOfLines={1} style={s.name}>{app.name}</Text><Text numberOfLines={1} style={s.host}>{new URL(app.startUrl).host}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Project opnieuw laden" onPress={() => { setError(''); setNotice(''); setAttempt(v => v + 1); }} style={s.button}><Text style={s.link}>↻</Text></Pressable>
    </View>
    {loading && !error && <ActivityIndicator color="#6358d7" style={s.progress} accessibilityLabel="Project laden" />}
    {!!notice && <Pressable accessibilityRole="button" accessibilityLabel="Melding sluiten" onPress={() => setNotice('')}><Text style={s.notice}>{notice}</Text></Pressable>}
    {error ? <View style={s.center}><Text style={s.name}>Project niet geladen</Text><Text style={s.message}>{error}</Text><Pressable accessibilityRole="button" style={s.button} onPress={() => { setError(''); setAttempt(v => v + 1); }}><Text style={s.link}>Opnieuw proberen</Text></Pressable></View> :
      <WebView<WebViewProps> key={`${app.id}:${attempt}`} ref={ref} source={{ uri: app.startUrl }} style={s.fill}
        originWhitelist={['*']} // Route ALL schemes through the guard, never automatically to the OS.
        onShouldStartLoadWithRequest={(request) => {
          const allowed = canNavigate(app, request.url);
          if (!allowed) setNotice('Deze link valt buiten dit project en is niet geopend.');
          return allowed;
        }}
        onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
        onOpenWindow={() => setNotice('Nieuwe vensters worden niet geopend. Gebruik links binnen dit project.')}
        onFileDownload={() => setNotice('Gebruik de kopieerfunctie van het project om je back-up te bewaren.')}
        onLoadStart={() => setLoading(true)} onLoadEnd={() => setLoading(false)}
        onError={() => { setLoading(false); setError('Controleer je verbinding en of de projectwebsite bereikbaar is.'); }}
        onHttpError={(event) => { if (event.nativeEvent.url === app.startUrl) { setLoading(false); setError(`De website geeft fout ${event.nativeEvent.statusCode}.`); } }}
        onContentProcessDidTerminate={() => { setLoading(false); setError('Het project is gestopt. Je kunt het opnieuw laden.'); }}
        javaScriptEnabled domStorageEnabled incognito={false} cacheEnabled
        sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false}
        allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
        mixedContentMode="never" javaScriptCanOpenWindowsAutomatically={false}
        mediaCapturePermissionGrantType="deny" geolocationEnabled={false}
        allowsBackForwardNavigationGestures={false} allowsLinkPreview={false}
      />}
    {canGoBack && !error && <Pressable accessibilityRole="button" style={s.button} onPress={() => ref.current?.goBack()}><Text style={s.link}>Vorige pagina</Text></Pressable>}
  </View>;
}
const s = StyleSheet.create({
  fill:{flex:1},bar:{flexDirection:'row',alignItems:'center',backgroundColor:'#fff',borderBottomWidth:1,borderColor:'#e7e3ef'},
  button:{minHeight:48,padding:14,justifyContent:'center'},link:{color:'#6358d7',fontSize:15,fontWeight:'600'},title:{flex:1,alignItems:'center'},
  name:{fontSize:16,fontWeight:'700',color:'#252333'},host:{fontSize:10,color:'#777383'},progress:{padding:8},notice:{padding:12,backgroundColor:'#fff2d7',color:'#75561f',fontSize:12},
  center:{flex:1,padding:24,justifyContent:'center',alignItems:'center',gap:16},message:{fontSize:15,lineHeight:23,color:'#777383',textAlign:'center'},
});
