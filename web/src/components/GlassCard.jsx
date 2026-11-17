import React from 'react';

const GlassCard = ({ children, className = '', as: Tag = 'section', ...props }) => (
  <Tag className={`glass-card ${className}`.trim()} {...props}>
    {children}
  </Tag>
);

export default GlassCard;
