import React from 'react';
import { Modal, View, Text, Pressable, Platform } from 'react-native';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function AdPopup({ visible, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.4)',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Pressable
            onPress={onClose}
            style={{
              alignSelf: 'center',
              paddingVertical: 10,
              paddingHorizontal: 20,
              borderRadius: 8,
              backgroundColor: '#111',
              marginBottom: 12,
            }}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Close</Text>
          </Pressable>
        <View
          style={{
            width: '100%',
            maxWidth: 360,
            backgroundColor: '#fff',
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 10,
            elevation: 4,
            height:'80%'
          }}>
          <View
            style={{
              height: '100%',
              borderWidth: 1,
              borderColor: '#e5e7eb',
              backgroundColor: '#f8fafc',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
              overflow: 'hidden',
            }}>
            <Text style={{ color: '#4b5563', fontSize: 14, marginBottom: 6 }}>
              {Platform.OS === 'web' ? 'Ad placeholder (web)' : 'Ad placeholder'}
            </Text>
            <Text style={{ color: '#6b7280', fontSize: 12 }}>320 x 250</Text>
          </View>

          
        </View>
      </View>
    </Modal>
  );
}
