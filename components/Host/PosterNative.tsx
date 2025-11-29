import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import ViewShot, { captureRef } from 'react-native-view-shot';

type PosterNativeProps = {
  joinUrl: string;
  slug: string;
  detailLines?: string[];
  blackWhite?: boolean;
};

export type PosterNativeHandle = {
  capture: () => Promise<string>; // returns file:// uri
};

const gradients: [string, string][] = [
  ['#0ba360', '#3cba92'],
  ['#4facfe', '#00f2fe'],
  ['#f12711', '#f5af19'],
  ['#8e2de2', '#4a00e0'],
  ['#ee0979', '#ff6a00'],
];

export const PosterNative = forwardRef<PosterNativeHandle, PosterNativeProps>(
  ({ joinUrl, slug, detailLines, blackWhite }, ref) => {
    const shotRef = useRef<ViewShot>(null);
    const gradient = useMemo(
      () => gradients[Math.abs(slug.length + joinUrl.length) % gradients.length],
      [slug.length, joinUrl.length]
    );

    useImperativeHandle(ref, () => ({
      async capture() {
        if (!shotRef.current) throw new Error('Poster not ready');
        let uri = await captureRef(shotRef, {
          format: 'png',
          quality: 1,
          result: 'tmpfile',
        });
        if (uri && !uri.startsWith('file://')) {
          uri = `file://${uri}`;
        }
        return uri;
      },
    }));

    return (
      <ViewShot
        ref={shotRef}
        style={styles.canvas}
        options={{ format: 'png', quality: 1 }}
        collapsable={false}>
        <LinearGradient colors={gradient} style={StyleSheet.absoluteFill} />
        <View style={styles.content}>
          <Text style={styles.title}>QueueUp</Text>
          <Text style={styles.slug}>Join code: {slug}</Text>
          <View style={styles.qrWrapper}>
            <View style={[styles.qrInner, blackWhite && styles.qrInnerBW]}>
              <QRCode
                value={joinUrl}
                size={580}
                color={blackWhite ? '#000' : '#111'}
                backgroundColor="transparent"
              />
            </View>
          </View>
          <View style={styles.details}>
            {detailLines?.map((line, idx) => (
              <Text key={idx} style={styles.detailText}>
                {line}
              </Text>
            ))}
            <Text style={styles.small}>Scan the code to join instantly.</Text>
          </View>
        </View>
      </ViewShot>
    );
  }
);

const styles = StyleSheet.create({
  canvas: {
    width: 1080,
    height: 1920,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 120,
    paddingHorizontal: 96,
    gap: 36,
  },
  title: {
    color: '#fff',
    fontSize: 76,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  slug: {
    color: '#fff',
    fontSize: 42,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  qrWrapper: {
    padding: 36,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 32,
  },
  qrInner: {
    padding: 22,
    backgroundColor: '#fff',
    borderRadius: 24,
  },
  qrInnerBW: {
    backgroundColor: '#f5f5f5',
  },
  details: {
    alignItems: 'center',
    gap: 10,
  },
  detailText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
  },
  small: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 24,
    marginTop: 14,
  },
});

export default PosterNative;
