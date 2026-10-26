
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.logo}>✚</Text>
        <Text style={styles.title}>Dr.MAS 테스트성공!</Text>
        <Text style={styles.subtitle}>
          당신과 가족의 건강을 연결하는 스마트 헬스케어
        </Text>

        <TouchableOpacity
          style={styles.patientButton}
          onPress={() => Alert.alert('환자 모드', '다음 단계에서 구현합니다.')}
        >
          <Text style={styles.buttonText}>환자로 시작하기</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.guardianButton}
          onPress={() => Alert.alert('보호자 모드', '다음 단계에서 구현합니다.')}
        >
          <Text style={styles.guardianText}>보호자로 시작하기</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>
          Dr.MAS · Smart Healthcare System
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F9FC',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  logo: {
    fontSize: 64,
    color: '#1478D4',
    marginBottom: 16,
  },
  title: {
    fontSize: 43,
    fontWeight: '800',
    color: '#123B64',
  },
  subtitle: {
    marginTop: 14,
    marginBottom: 55,
    fontSize: 17,
    lineHeight: 26,
    textAlign: 'center',
    color: '#526476',
  },
  patientButton: {
    backgroundColor: '#1478D4',
    width: '100%',
    paddingVertical: 19,
    borderRadius: 15,
    alignItems: 'center',
    marginBottom: 14,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  guardianButton: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    paddingVertical: 19,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: '#1478D4',
    alignItems: 'center',
  },
  guardianText: {
    color: '#1478D4',
    fontSize: 18,
    fontWeight: '700',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    color: '#8999A8',
    fontSize: 12,
  },
});
