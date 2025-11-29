import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FAF9FA',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  // Desktop styles
  desktopScrollContent: {
    paddingHorizontal: 48,
    paddingVertical: 40,
    maxWidth: 800,
    width: '100%',
    alignSelf: 'center',
  },
  desktopCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 48,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  desktopTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 12,
  },
  desktopSubtitle: {
    fontSize: 15,
    color: '#666',
    marginTop: 4,
  },
  desktopParagraph: {
    marginTop: 20,
    fontSize: 15,
    lineHeight: 26,
    color: '#333333',
  },
  desktopSection: {
    marginTop: 32,
  },
  desktopSectionHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111111',
  },
  subtitleSpacing: {
    marginTop: 4,
  },
  paragraph: {
    marginTop: 16,
    fontSize: 14,
    lineHeight: 22,
    color: '#333333',
  },
  section: {
    marginTop: 24,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
    textDecorationLine: 'underline',
  },
  bulletList: {
    marginTop: 8,
    paddingLeft: 16,
  },
  bulletItem: {
    fontSize: 14,
    lineHeight: 22,
    color: '#333333',
  },
  link: {
    color: '#2563EB',
    textDecorationLine: 'underline',
  },
});

export default styles;
